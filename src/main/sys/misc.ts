import { exec, execFile, execFileSync, execSync, spawn } from 'child_process'
import { app, dialog, nativeTheme, shell } from 'electron'
import { readdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { promisify } from 'util'
import {
  dataDir,
  exePath,
  logDir,
  mihomoCorePath,
  profilePath,
  resourcesDir,
  resourcesFilesDir,
  taskDir
} from '../utils/dirs'
import { appendFileSync, copyFileSync, existsSync, writeFileSync } from 'fs'
import { t } from '../utils/i18n'
import { packageName, productName } from '../../shared/branding'

const elevateTaskName = `${packageName}-run`
// The runner is bundled into resources/files under this same branded name (see the
// prepare script) and copied into the per-user tasks dir on first elevation.
const elevateTaskRunner = `${packageName}-run.exe`
const logonTaskName = `${packageName}-logon`

// Append a timestamped line to a durable elevation diagnostics log. Never throws —
// diagnostics must not break startup. Previously these failures were swallowed silently,
// which hid why the scheduled-task escalator failed on fresh boot/install.
export function logElevation(message: string): void {
  try {
    appendFileSync(path.join(taskDir(), 'elevate.log'), `[${new Date().toISOString()}] ${message}\n`)
  } catch {
    // ignore
  }
}

export function getFilePath(ext: string[]): string[] | undefined {
  return dialog.showOpenDialogSync({
    title: t('dialog.selectSubscriptionFile'),
    filters: [{ name: `${ext} file`, extensions: ext }],
    properties: ['openFile']
  })
}

export async function readTextFile(filePath: string): Promise<string> {
  return await readFile(filePath, 'utf8')
}

function getUniqueDesktopLogPath(): string {
  const desktop = app.getPath('desktop')
  const baseName = `${packageName}-logs`
  const extension = '.txt'
  let index = 0
  let target = path.join(desktop, `${baseName}${extension}`)

  while (existsSync(target)) {
    index += 1
    target = path.join(desktop, `${baseName} (${index})${extension}`)
  }

  return target
}

export async function exportLogsToDesktop(rendererLogs: ControllerLog[] = []): Promise<string> {
  const sections: string[] = [
    `${productName} logs`,
    `Exported: ${new Date().toLocaleString()}`,
    ''
  ]

  try {
    const files = (await readdir(logDir())).filter((file) => file.endsWith('.log')).sort()
    for (const file of files) {
      const content = await readFile(path.join(logDir(), file), 'utf8')
      sections.push(`===== ${file} =====`, content.trimEnd(), '')
    }
  } catch {
    sections.push('===== Core log files =====', 'No saved log files found.', '')
  }

  if (rendererLogs.length > 0) {
    sections.push(
      '===== Live UI logs =====',
      rendererLogs
        .map((log) => `[${log.time ?? ''}] [${log.type ?? ''}] ${log.payload ?? ''}`.trim())
        .join('\n'),
      ''
    )
  }

  const target = getUniqueDesktopLogPath()
  await writeFile(target, sections.join('\n'), 'utf8')
  return target
}

export function openFile(id: string): void {
  shell.openPath(profilePath(id))
}

export async function openPath(target: string): Promise<void> {
  const error = await shell.openPath(target)
  if (error) {
    throw new Error(error)
  }
}

export async function openUWPTool(): Promise<void> {
  const execFilePromise = promisify(execFile)
  const uwpToolPath = path.join(resourcesDir(), 'files', 'enableLoopback.exe')
  await execFilePromise(uwpToolPath)
}

export async function setupFirewall(): Promise<void> {
  const execPromise = promisify(exec)
  const appName = app.getName()
  const removeCommand = `
  $rules = @("mihomo", "mihomo-alpha", "${appName}", "Sparkle", "Mihomo Party")
  foreach ($rule in $rules) {
    if (Get-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue) {
      Remove-NetFirewallRule -DisplayName $rule -ErrorAction SilentlyContinue
    }
  }
  `
  const createCommand = `
  New-NetFirewallRule -DisplayName "mihomo" -Direction Inbound -Action Allow -Program "${mihomoCorePath('mihomo')}" -Enabled True -Profile Any -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName "mihomo-alpha" -Direction Inbound -Action Allow -Program "${mihomoCorePath('mihomo-alpha')}" -Enabled True -Profile Any -ErrorAction SilentlyContinue
  New-NetFirewallRule -DisplayName "${appName}" -Direction Inbound -Action Allow -Program "${exePath()}" -Enabled True -Profile Any -ErrorAction SilentlyContinue
  `

  if (process.platform === 'win32') {
    await execPromise(removeCommand, { shell: 'powershell' })
    await execPromise(createCommand, { shell: 'powershell' })
  }
}

export function setNativeTheme(theme: 'system' | 'light' | 'dark'): void {
  nativeTheme.themeSource = theme
}

// Built lazily, NOT as a module-level const: taskDir()/exePath() must be read at call
// time. The const form froze them at import — which runs before index.ts's
// app.setName/app.setPath('userData', productName) — so for forks where packageName
// (Electron's default userData leaf) differs from productName beyond case, the baked
// <Command> pointed at appData\<packageName>\tasks while the runner is actually copied
// into appData\<productName>\tasks. runElevateTaskSync then rejected the mismatch and
// silent elevation never fired. (Canonical app was masked: clashapp vs ClashApp collapse
// to one folder on case-insensitive Windows.)
function buildElevateTaskXml(): string {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers />
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>Parallel</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>3</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"${path.join(taskDir(), elevateTaskRunner)}"</Command>
      <Arguments>"${exePath()}"</Arguments>
    </Exec>
  </Actions>
</Task>
`
}

export function createElevateTaskSync(): void {
  const taskFilePath = path.join(taskDir(), `${elevateTaskName}.xml`)
  writeFileSync(taskFilePath, Buffer.from(`\ufeff${buildElevateTaskXml()}`, 'utf-16le'))
  copyFileSync(
    path.join(resourcesFilesDir(), elevateTaskRunner),
    path.join(taskDir(), elevateTaskRunner)
  )
  execSync(
    `%SystemRoot%\\System32\\schtasks.exe /create /tn "${elevateTaskName}" /xml "${taskFilePath}" /f`
  )
}

export function runElevateTaskSync(args: string[]): boolean {
  const runnerPath = path.join(taskDir(), elevateTaskRunner)
  if (!existsSync(runnerPath)) return false

  try {
    const taskXmlBuffer = execFileSync('schtasks.exe', ['/query', '/tn', elevateTaskName, '/xml'], {
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const taskXml = (taskXmlBuffer.includes(0)
      ? taskXmlBuffer.toString('utf16le')
      : taskXmlBuffer.toString('utf8')
    )
      .replace(/&quot;/g, '"')
      .toLowerCase()

    if (
      !taskXml.includes(exePath().toLowerCase()) ||
      !taskXml.includes(runnerPath.toLowerCase())
    ) {
      return false
    }

    writeFileSync(path.join(taskDir(), 'param.txt'), args.length > 0 ? args.join(' ') : 'empty')
    execFileSync('schtasks.exe', ['/run', '/tn', elevateTaskName], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

// The logon task autostarts the app elevated at user logon. Unlike the on-demand
// runner task, it execs the app exe directly (HighestAvailable gives it elevation with
// no UAC prompt) — there are no dynamic args at logon, so the runner/param.txt indirection
// isn't needed.
function currentUserId(): string | null {
  try {
    return execSync('whoami', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

function buildLogonTaskXml(): string {
  const userId = currentUserId()
  const trigger = userId
    ? `<LogonTrigger>\n      <Enabled>true</Enabled>\n      <UserId>${userId}</UserId>\n    </LogonTrigger>`
    : `<LogonTrigger>\n      <Enabled>true</Enabled>\n    </LogonTrigger>`
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <Triggers>
    ${trigger}
  </Triggers>
  <Principals>
    <Principal id="Author">
      <LogonType>InteractiveToken</LogonType>
      <RunLevel>HighestAvailable</RunLevel>
    </Principal>
  </Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <AllowHardTerminate>false</AllowHardTerminate>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>false</WakeToRun>
    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
    <Priority>5</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>"${exePath()}"</Command>
    </Exec>
  </Actions>
</Task>
`
}

export function createLogonTaskSync(): void {
  const taskFilePath = path.join(taskDir(), `${logonTaskName}.xml`)
  // Prefix the UTF-16LE byte-order mark (schtasks requires it) as raw bytes, so no
  // literal BOM character ends up in the source.
  const bom = Buffer.from([0xff, 0xfe])
  writeFileSync(taskFilePath, Buffer.concat([bom, Buffer.from(buildLogonTaskXml(), 'utf-16le')]))
  execSync(
    `%SystemRoot%\\System32\\schtasks.exe /create /tn "${logonTaskName}" /xml "${taskFilePath}" /f`
  )
}

export function deleteLogonTaskSync(): void {
  try {
    execSync(`%SystemRoot%\\System32\\schtasks.exe /delete /tn "${logonTaskName}" /f`, {
      stdio: 'ignore'
    })
  } catch {
    // ignore
  }
}

export function checkLogonTaskSync(): boolean {
  try {
    execSync(`%SystemRoot%\\System32\\schtasks.exe /query /tn "${logonTaskName}"`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// Pop the Windows UAC prompt directly to relaunch elevated. Returns true if the user
// accepted (PowerShell exits 0) and false if they declined (Start-Process throws
// ERROR_CANCELLED / 1223) or it otherwise failed — the caller then falls back to the
// in-app admin-required dialog.
export function tryElevateViaUAC(args: string[]): boolean {
  try {
    const escapedExe = exePath().replace(/'/g, "''")
    const argList = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',')
    const command =
      args.length > 0
        ? `Start-Process -FilePath '${escapedExe}' -ArgumentList ${argList} -Verb RunAs`
        : `Start-Process -FilePath '${escapedExe}' -Verb RunAs`
    execFileSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export async function deleteElevateTask(): Promise<void> {
  try {
    execSync(`%SystemRoot%\\System32\\schtasks.exe /delete /tn "${elevateTaskName}" /f`)
  } catch {
    // ignore
  }
}

export async function checkElevateTask(): Promise<boolean> {
  try {
    execSync(`%SystemRoot%\\System32\\schtasks.exe /query /tn "${elevateTaskName}"`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function resetAppConfig(): void {
  if (process.platform === 'win32') {
    spawn(
      'cmd',
      [
        '/C',
        `"timeout /t 2 /nobreak >nul && rmdir /s /q "${dataDir()}" && start "" "${exePath()}""`
      ],
      {
        shell: true,
        detached: true
      }
    ).unref()
  } else {
    const script = `while kill -0 ${process.pid} 2>/dev/null; do
  sleep 0.1
done
  rm -rf '${dataDir()}'
  ${process.argv.join(' ')} & disown
exit
`
    spawn('sh', ['-c', `"${script}"`], {
      shell: true,
      detached: true,
      stdio: 'ignore'
    })
  }
  app.quit()
}
