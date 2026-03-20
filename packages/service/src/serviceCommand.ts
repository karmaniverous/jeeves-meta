/**
 * CLI `service` subcommand — install/uninstall/start/stop/status/remove instructions.
 *
 * @module serviceCommand
 */

import { Command } from 'commander';

/** Register the `service` subcommand tree on the given parent command. */
export function registerServiceCommand(
  parent: Command,
  apiGet: (port: number, path: string) => Promise<unknown>,
  defaultPort: string,
): void {
  const service = parent
    .command('service')
    .description('Generate service install/uninstall instructions');

  service.addCommand(
    new Command('install')
      .description('Print install instructions for a system service')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('-n, --name <name>', 'Service name', 'jeeves-meta')
      .action((options: { config?: string; name: string }) => {
        const { name } = options;
        const configFlag = options.config ? ` -c "${options.config}"` : '';

        if (process.platform === 'win32') {
          console.log('# NSSM install (Windows)');
          console.log(
            `  nssm install ${name} node "%APPDATA%\\npm\\node_modules\\@karmaniverous\\jeeves-meta\\dist\\cli\\jeeves-meta\\index.js" start${configFlag}`,
          );
          console.log(`  nssm set ${name} AppDirectory "%CD%"`);
          console.log(`  nssm set ${name} DisplayName "Jeeves Meta"`);
          console.log(
            `  nssm set ${name} Description "Meta synthesis service"`,
          );
          console.log(`  nssm set ${name} Start SERVICE_AUTO_START`);
          console.log(`  nssm start ${name}`);
          return;
        }

        if (process.platform === 'darwin') {
          const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jeeves.meta</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/jeeves-meta</string>
    <string>start</string>${options.config ? `\n    <string>-c</string>\n    <string>${options.config}</string>` : ''}
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/${name}.stdout.log</string>
  <key>StandardErrorPath</key><string>/tmp/${name}.stderr.log</string>
</dict>
</plist>`;
          console.log('# launchd plist (macOS)');
          console.log(`# ~/Library/LaunchAgents/com.jeeves.meta.plist`);
          console.log(plist);
          console.log();
          console.log('# install');
          console.log(
            `  launchctl load ~/Library/LaunchAgents/com.jeeves.meta.plist`,
          );
          return;
        }

        // Linux (systemd)
        const unit = [
          '[Unit]',
          'Description=Jeeves Meta - Synthesis Service',
          'After=network.target',
          '',
          '[Service]',
          'Type=simple',
          'WorkingDirectory=%h',
          `ExecStart=/usr/bin/env jeeves-meta start${configFlag}`,
          'Restart=on-failure',
          '',
          '[Install]',
          'WantedBy=default.target',
        ].join('\n');

        console.log('# systemd unit file (Linux)');
        console.log(`# ~/.config/systemd/user/${name}.service`);
        console.log(unit);
        console.log();
        console.log('# install');
        console.log(`  systemctl --user daemon-reload`);
        console.log(`  systemctl --user enable --now ${name}.service`);
      }),
  );

  service.addCommand(
    new Command('start')
      .description('Print start instructions for the installed service')
      .option('-n, --name <name>', 'Service name', 'jeeves-meta')
      .action((options: { name: string }) => {
        const { name } = options;

        if (process.platform === 'win32') {
          console.log('# NSSM start (Windows)');
          console.log(`  nssm start ${name}`);
          return;
        }

        if (process.platform === 'darwin') {
          console.log('# launchd start (macOS)');
          console.log(
            `  launchctl load ~/Library/LaunchAgents/com.jeeves.meta.plist`,
          );
          return;
        }

        console.log('# systemd start (Linux)');
        console.log(`  systemctl --user start ${name}.service`);
      }),
  );

  service.addCommand(
    new Command('stop')
      .description('Stop the running service')
      .option('-n, --name <name>', 'Service name', 'jeeves-meta')
      .action((options: { name: string }) => {
        const { name } = options;

        if (process.platform === 'win32') {
          console.log('# NSSM stop (Windows)');
          console.log(`  nssm stop ${name}`);
          return;
        }

        if (process.platform === 'darwin') {
          console.log('# launchd stop (macOS)');
          console.log(
            `  launchctl unload ~/Library/LaunchAgents/com.jeeves.meta.plist`,
          );
          return;
        }

        console.log('# systemd stop (Linux)');
        console.log(`  systemctl --user stop ${name}.service`);
      }),
  );

  service.addCommand(
    new Command('status')
      .description('Show service status via HTTP API')
      .option('-p, --port <port>', 'Service port', defaultPort)
      .action(async (opts: { port: string }) => {
        try {
          const data = await apiGet(parseInt(opts.port, 10), '/status');
          console.log(JSON.stringify(data, null, 2));
        } catch (err) {
          console.error('Service unreachable:', (err as Error).message);
          process.exit(1);
        }
      }),
  );

  service.addCommand(
    new Command('remove')
      .description('Print remove instructions for a system service')
      .option('-n, --name <name>', 'Service name', 'jeeves-meta')
      .action((options: { name: string }) => {
        const { name } = options;

        if (process.platform === 'win32') {
          console.log('# NSSM remove (Windows)');
          console.log(`  nssm stop ${name}`);
          console.log(`  nssm remove ${name} confirm`);
          return;
        }

        if (process.platform === 'darwin') {
          console.log('# launchd remove (macOS)');
          console.log(
            `  launchctl unload ~/Library/LaunchAgents/com.jeeves.meta.plist`,
          );
          console.log(`  rm ~/Library/LaunchAgents/com.jeeves.meta.plist`);
          return;
        }

        console.log('# systemd remove (Linux)');
        console.log(`  systemctl --user disable --now ${name}.service`);
        console.log(`# rm ~/.config/systemd/user/${name}.service`);
        console.log(`  systemctl --user daemon-reload`);
      }),
  );
}
