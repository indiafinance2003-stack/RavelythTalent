# Owner launch checklist

Do not run this against production data during initial testing. Use a staging
server and accounts first.

1. On the Ubuntu server, follow `deploy/DEPLOYMENT.md` to install the app,
   PostgreSQL, Nginx, and the `ravelyth` service user. Set the real database
   password and production environment values in `/var/www/ravelyth/.env`.
2. From the app directory, prepare the database and build:

   ```bash
   cd /var/www/ravelyth
   sudo -u ravelyth npm ci --include=dev
   sudo -u ravelyth npm run db:migrate
   sudo -u ravelyth npm run seed
   sudo -u ravelyth npm run seed:admin
   sudo -u ravelyth npm run build
   sudo systemctl restart ravelyth
   curl --fail https://ravelyth.in/api/health
   ```

3. In Admin → Settings, enter the real business name, address, support
   contacts, GSTIN, and GST rate. Add the approved logo if one is available.
4. In Admin → Emails, send a test email. Ask the email provider to confirm
   SPF, DKIM, and DMARC are set up for the domain.
5. Configure Razorpay keys and its payment webhook only when the account is
   approved. Configure Google sign-in only if wanted. Do not enable SMS OTP:
   a real SMS provider is not implemented yet.
6. Open the public site on a phone and computer. Test account verification,
   sign-in, job search, an application, recruiter approval, and admin review
   using test accounts.
7. Confirm scheduled jobs and backups are active:

   ```bash
   systemctl list-timers 'ravelyth-*'
   sudo systemctl start ravelyth-backup.service
   sudo systemctl status ravelyth-backup.service --no-pager
   sudo ls -lh /var/backups/ravelyth
   ```

   Database dumps do not include uploaded files. Arrange a separate encrypted
   uploads backup and test restoring both backups before launch.
8. Do not invite real users until all checklist items pass and the unresolved
   items in `KNOWN_ISSUES.md` have been reviewed.
