import { spawn, type ChildProcess } from 'child_process'
import { delimiter } from 'path'
import { mkdirSync } from 'fs'
import { app } from 'electron'
import type { Account } from '../auth/accounts'
import type { PreparedVersion } from './download'
import { ruleApplies, type Rule, type RuleArg } from './versions'

export interface LaunchOptions {
  account: Account
  prepared: PreparedVersion
  instanceDir: string
  javaPath: string
  memoryMb: number
  authlibInjector?: string
  extraJvmArgs?: string[]
  width?: number
  height?: number
}

function argAllowed(rules: Rule[] | undefined, features: Record<string, boolean>): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (ruleApplies(rule, features)) allowed = rule.action === 'allow'
  }
  return allowed
}

function substitute(input: string, repl: Record<string, string>): string {
  return input.replace(/\$\{([^}]+)\}/g, (whole, key: string) => (key in repl ? repl[key] : whole))
}

export function buildArgs(opts: LaunchOptions): string[] {
  const { account, prepared, instanceDir, memoryMb } = opts
  const version = prepared.versionJson

  const token =
    account.type === 'microsoft' ? account.mcToken : account.type === 'authlib' ? account.accessToken : '0'
  const userType = account.type === 'microsoft' ? 'msa' : account.type === 'authlib' ? 'mojang' : 'legacy'

  const repl: Record<string, string> = {
    auth_player_name: account.username,
    version_name: version.id,
    game_directory: instanceDir,
    assets_root: prepared.assetsDir,
    game_assets: prepared.assetsDir,
    assets_index_name: prepared.assetIndexName,
    auth_uuid: account.uuid.replace(/-/g, ''),
    auth_access_token: token,
    auth_session: token,
    user_type: userType,
    user_properties: '{}',
    version_type: version.type ?? 'release',
    natives_directory: prepared.nativesDir,
    launcher_name: 'Aurora',
    launcher_version: app.getVersion(),
    classpath: prepared.classpath.join(delimiter),
    classpath_separator: delimiter,
    library_directory: '',
    clientid: '',
    auth_xuid: ''
  }

  const features = {
    is_demo_user: false,
    has_custom_resolution: Boolean(opts.width && opts.height),
    is_quick_play_singleplayer: false,
    is_quick_play_multiplayer: false,
    is_quick_play_realms: false
  }

  const jvm: string[] = [`-Xmx${memoryMb}M`, `-Xms${Math.min(1024, memoryMb)}M`]
  if (opts.authlibInjector && account.type === 'authlib') {
    jvm.push(`-javaagent:${opts.authlibInjector}=${account.serverUrl}`)
  }
  jvm.push(...(opts.extraJvmArgs ?? []))

  const expand = (arg: string | RuleArg, target: string[]): void => {
    if (typeof arg === 'string') {
      target.push(substitute(arg, repl))
      return
    }
    if (!argAllowed(arg.rules, features)) return
    const values = Array.isArray(arg.value) ? arg.value : [arg.value]
    for (const v of values) target.push(substitute(v, repl))
  }

  if (version.arguments?.jvm) {
    for (const arg of version.arguments.jvm) expand(arg, jvm)
  } else {
    jvm.push(`-Djava.library.path=${prepared.nativesDir}`, '-cp', prepared.classpath.join(delimiter))
  }

  const game: string[] = []
  if (version.arguments?.game) {
    for (const arg of version.arguments.game) expand(arg, game)
  } else if (version.minecraftArguments) {
    for (const part of version.minecraftArguments.split(' ')) game.push(substitute(part, repl))
  }
  if (opts.width && opts.height) {
    game.push('--width', String(opts.width), '--height', String(opts.height))
  }

  return [...jvm, version.mainClass, ...game]
}

export function spawnGame(opts: LaunchOptions): ChildProcess {
  mkdirSync(opts.instanceDir, { recursive: true })
  const args = buildArgs(opts)
  return spawn(opts.javaPath, args, { cwd: opts.instanceDir })
}