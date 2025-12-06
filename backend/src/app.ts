import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { errorMiddleware } from './middlewares/error.middleware';
import healthRoutes from './routes/health.route';
import authRoutes from './routes/auth.route';
import oauthRoutes from './routes/oauth.route';

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('dev'));

const apiV1 = express.Router();

apiV1.use('/health', healthRoutes);
apiV1.use('/auth', authRoutes);
apiV1.use('/oauth', oauthRoutes);

app.use('/api/v1', apiV1);

app.use(errorMiddleware);

export default app;
