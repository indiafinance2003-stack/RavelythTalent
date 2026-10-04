import path from "node:path";

process.env.APP_URL ??= "http://localhost:3000";
process.env.DATABASE_URL ??= "postgresql://ravelyth_app:test-only@127.0.0.1:5432/ravelyth";
process.env.SESSION_SECRET ??= "unit-test-only-session-secret-32-bytes-minimum";
process.env.CRON_SECRET ??= "unit-test-only-cron-secret";
process.env.UPLOAD_DIR ??= path.join(process.cwd(), "uploads-test");
process.env.RAZORPAY_KEY_ID ??= "rzp_test_unit";
process.env.RAZORPAY_KEY_SECRET ??= "unit-test-razorpay-secret";
process.env.RAZORPAY_WEBHOOK_SECRET ??= "unit-test-webhook-secret";
