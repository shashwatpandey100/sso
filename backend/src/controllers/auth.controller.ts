import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { users, refreshTokens } from '../db/schema';
import { eq } from 'drizzle-orm';
import {
  hashPassword,
  comparePassword,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  generateTokenId,
  getRefreshTokenExpiry,
} from '../utils/jwt';
import logger from '../utils/logger';


// REGISTER
export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, username, password, name } = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
      return;
    }

    // Check if email/username already exists
    const existingEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const existingUsername = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (existingEmail.length > 0) {
      res.status(409).json({
        success: false,
        message: 'User with this email already exists',
      });
      return;
    } else if (username) {
      const existingUsername = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (existingUsername.length > 0) {
        res.status(409).json({
          success: false,
          message: 'Username already taken',
        });
        return;
      }
    }

    const hashedPassword = await hashPassword(password);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        username: username || null,
        password: hashedPassword,
        name: name || null,
        emailVerified: false,
      })
      .returning();

    logger.info(`New user registered: ${newUser.email} (${newUser.username})`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        id: newUser.id,
        email: newUser.email,
        username: newUser.username,
        name: newUser.name,
        emailVerified: newUser.emailVerified,
      },
    });
  } catch (error) {
    logger.error('Register error:', error);
    next(error);
  }
};


// LOGIN PAGE (GET)
export const getLoginPage = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { client_id, redirect_uri, state } = req.query;

    // Return login page data (frontend will render the form)
    res.status(200).json({
      success: true,
      message: 'Login page',
      data: {
        client_id: client_id || null,
        redirect_uri: redirect_uri || null,
        state: state || null,
      },
    });
  } catch (error) {
    logger.error('Get login page error:', error);
    next(error);
  }
};

// LOGIN (POST)
export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { identifier, password, client_id, redirect_uri, state } = req.body; // identifier can be email or username

    if (!identifier || !password) {
      res.status(400).json({
        success: false,
        message: 'Email/username and password are required',
      });
      return;
    }

    // Find user by email or username
    const userResults = await db.select().from(users).where(
      identifier.includes('@') 
        ? eq(users.email, identifier)
        : eq(users.username, identifier)
    ).limit(1);

    const user = userResults[0];
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
      return;
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials',
      });
      return;
    }

    // Generate tokens
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

    // Store refresh token (hashed) in database
    const tokenHash = hashToken(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: getRefreshTokenExpiry(),
      isRevoked: false,
    });

    // Set httpOnly cookies
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    // Set accounts_session cookie (Global SSO cookie for cross-app authentication)
    res.cookie('accounts_session', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      domain: process.env.COOKIE_DOMAIN || 'localhost', // e.g., '.shelfex.com' for production
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    logger.info(`User logged in: ${user.email}`);

    // Check if this is an OAuth login flow - if yes (redirect back to /oauth/authorize with the original params)
    if (client_id && redirect_uri) {
      const authorizeUrl = `/api/v1/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code${state ? `&state=${state}` : ''}`;
      res.redirect(authorizeUrl);
      return;
    }

    // Regular login - return tokens
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};


// REFRESH TOKEN
export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshTokenFromCookie = req.cookies?.refresh_token;
    const refreshTokenFromBody = req.body.refreshToken;
    const refreshTokenValue = refreshTokenFromCookie || refreshTokenFromBody;

    if (!refreshTokenValue) {
      res.status(401).json({
        success: false,
        message: 'Refresh token required',
      });
      return;
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshTokenValue);

    // Check if token exists in database and is not revoked
    const tokenHash = hashToken(refreshTokenValue);
    const [storedToken] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!storedToken) {
      res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
      });
      return;
    }

    if (storedToken.isRevoked) {
      res.status(401).json({
        success: false,
        message: 'Refresh token has been revoked',
      });
      return;
    }

    if (new Date() > storedToken.expiresAt) {
      res.status(401).json({
        success: false,
        message: 'Refresh token expired',
      });
      return;
    }

    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId)).limit(1);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
    });

    // Update last used timestamp
    await db
      .update(refreshTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash));

    // Set new access token cookie
    res.cookie('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 1 day
    });

    logger.info(`Token refreshed for user: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    logger.error('Refresh token error:', error);
    next(error);
  }
};


// LOGOUT
export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshTokenValue = req.cookies?.refresh_token;

    if (refreshTokenValue) {
      // Revoke refresh token in database
      const tokenHash = hashToken(refreshTokenValue);
      await db
        .update(refreshTokens)
        .set({ isRevoked: true })
        .where(eq(refreshTokens.tokenHash, tokenHash));
      
      logger.info('Refresh token revoked');
    }

    // Clear all authentication cookies
    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.clearCookie('accounts_session');

    logger.info('User logged out successfully');

    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    next(error);
  }
};


// GET CURRENT USER
export const getCurrentUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    // req.user is set by authMiddleware
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Not authenticated',
      });
      return;
    }

    // Get full user details
    const [user] = await db.select().from(users).where(eq(users.id, req.user.userId)).limit(1);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    logger.error('Get current user error:', error);
    next(error);
  }
};
