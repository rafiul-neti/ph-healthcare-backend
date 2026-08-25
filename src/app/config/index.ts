import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  bak_url: process.env.APP_URL,
  frontend_url: process.env.FRONTEND_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS,
  jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,
  google_client_id: process.env.GOOGLE_CLIENT_ID,
  super_admin_name: process.env.SUPER_ADMIN_NAME!,
  super_admin_email: process.env.SUPER_ADMIN_EMAIL!,
  seed_password: process.env.SEED_PASSWORD!,
  tester_admin_name: process.env.TESTER_ADMIN_NAME,
  tester_admin_email: process.env.TESTER_ADMIN_EMAIL,
  tester_doctor_email: process.env.TESTER_DOCTOR_EMAIL,
  tester_doctor_name: process.env.TESTER_DOCTOR_NAME,
  redis_user: process.env.REDIS_USER!,
  redis_password: process.env.REDIS_PASSWORD!,
  redis_host: process.env.REDIS_HOST!,
  redis_port: Number(process.env.REDIS_PORT!),
  smtp_user: process.env.SMTP_USER!,
  smtp_password: process.env.SMTP_PASSWORD!,
  email_sender: process.env.EMAIL_SENDER!,
  cloudinary_cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  cloudinary_api_key: process.env.CLOUDNINARY_API_KEY!,
  cloudinary_api_secret: process.env.CLOUDINARY_API_SECRET!,
  bkash_sandbox_url: process.env.BKASH_SANDBOX_URL!,
  bkash_username: process.env.BKASH_USERNAME!,
  bkash_password: process.env.BKASH_PASSWORD!,
  bkash_app_key: process.env.BKASH_APP_KEY!,
  bkash_app_secret: process.env.BKASH_APP_SECRET!,
  bkash_successful_01: Number(
    process.env.BKASH_SUCCESSFUL_TRANSACTIONS_NUMBER_01!,
  ),
  bkash_successful_02: Number(
    process.env.BKASH_SUCCESSFUL_TRANSACTIONS_NUMBER_02!,
  ),
  bkash_successful_03: Number(
    process.env.BKASH_SUCCESSFUL_TRANSACTIONS_NUMBER_03!,
  ),
  bkash_failed_01: Number(process.env.BKASH_FAILED_TRANSACTIONS_NUMBER_01!),
  bkash_failed_02: Number(process.env.BKASH_FAILED_TRANSACTIONS_NUMBER_02!),
  bkash_pin: Number(process.env.BKASH_PIN!),
  bkash_OTP: Number(process.env.BKASH_OTP!),
};
