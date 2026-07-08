// PM2 process config for the Execute-Gaming site.
//
//   pm2 start ecosystem.config.cjs   # start
//   pm2 restart execute-gaming       # after a rebuild
//   pm2 logs execute-gaming          # view logs
//
// Secrets and settings (PUBLIC_BASE_URL, Discord/Steam keys, PORT) live in
// .env and are loaded by dotenv — keep them out of this file.
module.exports = {
  apps: [
    {
      name: 'execute-gaming',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
