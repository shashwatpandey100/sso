import { cleanEnv, str, port } from 'envalid';

const validateEnv = () => {
  cleanEnv(process.env, {
    NODE_ENV: str(),
    PORT: port(),
    DATABASE_URL: str(),
    ACCESS_TOKEN_SECRET: str(),
    REFRESH_TOKEN_SECRET: str(),
    CORS_ORIGIN: str(),
    EMAIL_VERIFICATION_REQUIRED: str(),
  });
};

export default validateEnv;
