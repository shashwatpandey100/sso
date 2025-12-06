import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users, authCodes, clientApps } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import {
  generateAuthCode,
  getAuthCodeExpiry,
  generateAccessToken,
  generateRefreshToken,
  generateIdToken,
  verifyAccessToken,
  comparePassword,
  hashToken,
  generateTokenId,
  getRefreshTokenExpiry,
} from '../utils/jwt';
import { refreshTokens } from '../db/schema';
import logger from '../utils/logger';

// GET /oauth/authorize
export const authorize = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { client_id, redirect_uri, response_type, state } = req.query;

    // Validation
    if (!client_id || !redirect_uri || response_type !== 'code') {
      res.status(400).json({
        success: false,
        message: 'Invalid OAuth request',
        error: 'Required params: client_id, redirect_uri, response_type=code',
      });
      return;
    }

    // Validate client_id exists and redirect_uri is allowed
    const [client] = await db
      .select()
      .from(clientApps)
      .where(eq(clientApps.clientId, client_id as string))
      .limit(1);

    if (!client) {
      res.status(400).json({
        success: false,
        message: 'Invalid client_id',
        error: `Client '${client_id}' not registered`,
      });
      return;
    }

    // Check if redirect_uri is in the allowed list
    const allowedUris = client.allowedRedirectUris as string[];
    if (!allowedUris.includes(redirect_uri as string)) {
      res.status(400).json({
        success: false,
        message: 'Invalid redirect_uri',
        error: 'Redirect URI not registered for this client',
      });
      return;
    }

    // Check for accounts_session cookie
    const accountsSession = req.cookies?.accounts_session;

    if (!accountsSession) {
      // User is NOT logged in - redirect to login page
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const loginUrl = `${frontendUrl}/login?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&state=${state || ''}`;
      res.redirect(loginUrl);
      return;
    }

    // User has accounts_session cookie - verify it and proceed with SSO
    let userId: string;
    try {
      const decoded = verifyAccessToken(accountsSession);
      userId = decoded.userId;

      // Check email verification if required
      const emailVerificationRequired = process.env.EMAIL_VERIFICATION_REQUIRED === 'true';
      if (emailVerificationRequired && !decoded.emailVerified) {
        res.status(403).json({
          success: false,
          message: 'Email verification required',
          error: 'Please verify your email before accessing other apps',
        });
        return;
      }
    } catch (error) {
      // Session token is invalid/expired - redirect to login again
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const loginUrl = `${frontendUrl}/login?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri as string)}&state=${state || ''}`;
      res.redirect(loginUrl);
      return;
    }

    // Generate authorization code
    const code = generateAuthCode();
    await db.insert(authCodes).values({
      code,
      userId,
      clientId: client_id as string,
      redirectUri: redirect_uri as string,
      expiresAt: getAuthCodeExpiry(),
      isUsed: false,
    });

    // Redirect back to client app with the code
    const redirectUrl = new URL(redirect_uri as string);
    redirectUrl.searchParams.set('code', code);
    if (state) {
      redirectUrl.searchParams.set('state', state as string);
    }

    logger.info(`Authorization code generated for user ${userId}, client ${client_id}`);

    // Redirect user back to client app with authorization code
    res.redirect(redirectUrl.toString());
  } catch (error) {
    logger.error('OAuth authorize error:', error);
    next(error);
  }
};

// POST /oauth/token
export const token = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { code, client_id, client_secret, redirect_uri, grant_type } = req.body;

    // Validation
    if (
      !code ||
      !client_id ||
      !client_secret ||
      !redirect_uri ||
      grant_type !== 'authorization_code'
    ) {
      res.status(400).json({
        success: false,
        message: 'Invalid token request',
        error:
          'Required: code, client_id, client_secret, redirect_uri, grant_type=authorization_code',
      });
      return;
    }

    // Verify client credentials
    const [client] = await db
      .select()
      .from(clientApps)
      .where(eq(clientApps.clientId, client_id))
      .limit(1);

    if (!client) {
      res.status(401).json({
        success: false,
        message: 'Invalid client credentials',
        error: 'Client not found',
      });
      return;
    }

    // Verify client_secret
    const isSecretValid = await comparePassword(client_secret, client.clientSecret);
    if (!isSecretValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid client credentials',
        error: 'Client secret is incorrect',
      });
      return;
    }

    // Find and validate authorization code
    const [authCode] = await db
      .select()
      .from(authCodes)
      .where(and(eq(authCodes.code, code), eq(authCodes.clientId, client_id)))
      .limit(1);

    if (!authCode) {
      res.status(400).json({
        success: false,
        message: 'Invalid authorization code',
        error: 'Code not found or does not belong to this client',
      });
      return;
    }

    // Check if code is already used
    if (authCode.isUsed) {
      res.status(400).json({
        success: false,
        message: 'Authorization code already used',
        error: 'This code has been exchanged already',
      });
      return;
    }

    // Check if code is expired
    if (new Date() > authCode.expiresAt) {
      res.status(400).json({
        success: false,
        message: 'Authorization code expired',
        error: 'Code is no longer valid',
      });
      return;
    }

    // Verify redirect_uri matches
    if (authCode.redirectUri !== redirect_uri) {
      res.status(400).json({
        success: false,
        message: 'Invalid redirect_uri',
        error: 'Redirect URI does not match the one used in authorization',
      });
      return;
    }

    // Get user details
    const [user] = await db.select().from(users).where(eq(users.id, authCode.userId)).limit(1);

    if (!user) {
      res.status(400).json({
        success: false,
        message: 'User not found',
        error: 'Associated user no longer exists',
      });
      return;
    }

    // Mark code as used
    await db.update(authCodes).set({ isUsed: true }).where(eq(authCodes.code, code));

    // Generate tokens for the client app
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    });

    const tokenId = generateTokenId();
    const refreshToken = generateRefreshToken({
      userId: user.id,
      tokenId,
    });

    // Generate ID token with user information (OpenID Connect standard)
    const idToken = generateIdToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    });

    // Store refresh token (hashed) in database
    const tokenHash = hashToken(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: getRefreshTokenExpiry(),
      isRevoked: false,
    });

    logger.info(`Tokens issued for user ${user.email}, client ${client_id}`);

    // Return tokens to client app backend
    res.status(200).json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 86400, // 1 day in seconds
      id_token: idToken,
    });
  } catch (error) {
    logger.error('OAuth token error:', error);
    next(error);
  }
};
