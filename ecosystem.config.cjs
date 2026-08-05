module.exports = {
  apps: [
    {
      name: "hmf-risk-api",
      script: "./backend/server.js",
      cwd: "/home/ubuntu/hmf-risk-analytics",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      time: true,
      env: {
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3000",
        AWS_REGION: "ap-southeast-1",
        LOG_LEVEL: "info",
        INTERNAL_REFRESH_HEADER: "hmf-local-nginx-refresh"
      },
      error_file: "./logs/api-error.log",
      out_file: "./logs/api-output.log",
      merge_logs: true
    },
    {
      name: "hmf-risk-scheduler",
      script: "./backend/jobs/scheduledRefresh.js",
      cwd: "/home/ubuntu/hmf-risk-analytics",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      time: true,
      env: {
        NODE_ENV: "production",
        AWS_REGION: "ap-southeast-1",
        LOG_LEVEL: "info"
      },
      error_file: "./logs/scheduler-error.log",
      out_file: "./logs/scheduler-output.log",
      merge_logs: true
    }
  ]
};
