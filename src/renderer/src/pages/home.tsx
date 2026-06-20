import { notifyError } from '@renderer/utils/notify'
import BasePage from '@renderer/components/base/base-page'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useControledMihomoConfig } from '@renderer/hooks/use-controled-mihomo-config'
import { useProfileConfig, type ProfileUpdateResult } from '@renderer/hooks/use-profile-config'
import { useGroups } from '@renderer/hooks/use-groups'
import {
  triggerSysProxy,
  updateTrayIcon,
  mihomoHotReloadConfig,
  patchMihomoConfig,
  mihomoCloseAllConnections
} from '@renderer/utils/ipc'
import { Switch } from '@renderer/components/ui/switch'
import NumberFlow from '@number-flow/react'
import { useTranslation } from 'react-i18next'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  WifiOff,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  PowerIcon,
  PauseIcon,
  RefreshCcw,
  TriangleAlert
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import EditInfoModal from '@renderer/components/profiles/edit-info-modal'
import { Spinner } from '@renderer/components/ui/spinner'
import { CharacterMorph } from '@renderer/components/ui/character-morph'
import { calcTraffic } from '@renderer/utils/calc'
import { useTrafficStore } from '@renderer/store/traffic-store'
import { useStatusLogStore } from '@renderer/store/status-log-store'
import StatusLog from '@renderer/components/home/status-log'

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`
}

// Module-level variable: persists across component mounts/unmounts
let connectionStartTime: number | null = null

const Home: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const {
    mainSwitchMode = 'tun',
    sysProxy,
    proxyMode = false,
    onlyActiveDevice = false,
    autoCloseConnection = true,
    globalModeToggle = false,
    showTrafficUsage = true
  } = appConfig || {}
  const { enable: writeSysProxy = true, mode: sysProxyMode } = sysProxy || {}
  const { controledMihomoConfig, patchControledMihomoConfig } = useControledMihomoConfig()
  const { tun, mode: outboundMode = 'rule' } = controledMihomoConfig || {}
  const { 'mixed-port': mixedPort } = controledMihomoConfig || {}
  const sysProxyDisabled = mixedPort == 0

  const { profileConfig, addProfileItem } = useProfileConfig()
  const { groups, mutate: mutateGroups } = useGroups()
  const navigate = useNavigate()
  const hasProfiles = (profileConfig?.items?.length ?? 0) > 0

  const trafficInfo = useTrafficStore((s) => s.traffic)
  const statusBegin = useStatusLogStore((s) => s.begin)
  const statusFinish = useStatusLogStore((s) => s.finish)
  const statusFail = useStatusLogStore((s) => s.fail)

  const [importOpen, setImportOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modeLoading, setModeLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingDirection, setLoadingDirection] = useState<'connecting' | 'disconnecting'>(
    'connecting'
  )

  const [elapsed, setElapsed] = useState(() => {
    if (connectionStartTime !== null) {
      return Math.floor((Date.now() - connectionStartTime) / 1000)
    }
    return 0
  })

  const isSelected = (tun?.enable ?? false) || proxyMode

  useEffect(() => {
    if (isSelected) {
      if (connectionStartTime === null) {
        connectionStartTime = Date.now()
      }
      setElapsed(Math.floor((Date.now() - connectionStartTime) / 1000))
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - connectionStartTime!) / 1000))
      }, 1000)
      return () => clearInterval(interval)
    } else {
      connectionStartTime = null
      setElapsed(0)
      return undefined
    }
  }, [isSelected])

  const isDisabled =
    loading ||
    (mainSwitchMode === 'sysproxy' &&
      writeSysProxy &&
      sysProxyMode == 'manual' &&
      sysProxyDisabled)

  const status = loading
    ? loadingDirection === 'connecting'
      ? t('pages.home.connecting')
      : t('pages.home.disconnecting')
    : isSelected
      ? t('pages.home.connected')
      : t('pages.home.disconnected')
  const statusWidthTexts = [
    t('pages.home.connecting'),
    t('pages.home.disconnecting'),
    t('pages.home.connected'),
    t('pages.home.disconnected')
  ]
  const showConnectedTimer = !loading && isSelected
  const elapsedHours = Math.floor(elapsed / 3600)
  const elapsedMinutes = Math.floor((elapsed % 3600) / 60)
  const elapsedSeconds = elapsed % 60

  // Current profile & subscription
  const currentProfile = useMemo(() => {
    if (!profileConfig?.current || !profileConfig?.items) return null
    return profileConfig.items.find((item) => item.id === profileConfig.current) ?? null
  }, [profileConfig])

  const subscription = currentProfile?.extra
  const trafficUsed = (subscription?.upload ?? 0) + (subscription?.download ?? 0)
  const trafficTotal = subscription?.total ?? 0
  const trafficRemaining = trafficTotal > 0 ? trafficTotal - trafficUsed : 0
  const expireTimestamp = subscription?.expire ?? 0
  const expireDate = expireTimestamp > 0 ? dayjs.unix(expireTimestamp).format('L') : t('pages.home.never')

  const firstGroup = groups?.[0]
  const supportUrl = currentProfile?.supportUrl
  const supportHref = useMemo(() => {
    if (!supportUrl) return undefined
    try {
      return new URL(supportUrl).toString()
    } catch {
      return undefined
    }
  }, [supportUrl])

  // Global Mode toggle. Hidden unless the user opts in via Settings (globalModeToggle).
  // The current profile may also forbid it (globalMode === false), in which case the
  // toggle stays hidden; the backend also enforces this on profile change.
  const globalModeAllowed = globalModeToggle && currentProfile?.globalMode !== false
  const isGlobal = outboundMode === 'global'

  const onToggleFull = async (enable: boolean): Promise<void> => {
    if (modeLoading) return
    setModeLoading(true)
    const mode: OutboundMode = enable ? 'global' : 'rule'
    try {
      await patchControledMihomoConfig({ mode })
      await patchMihomoConfig({ mode })
      if (autoCloseConnection) {
        await mihomoCloseAllConnections()
      }
      mutateGroups()
      window.electron.ipcRenderer.send('updateTrayMenu')
    } catch (e) {
      notifyError(e)
    } finally {
      setModeLoading(false)
    }
  }

  // Add/refresh a subscription while narrating the backend steps in the status log.
  // The intermediate steps stream in from the main process; we only own the
  // terminal line here since we know the outcome.
  const addProfileItemWithStatus = async (
    item: Partial<ProfileItem>,
    failKey: 'refreshFailed' | 'addFailed'
  ): Promise<ProfileUpdateResult> => {
    statusBegin()
    const result = await addProfileItem(item)
    if (result === 'updated') {
      statusFinish('updated')
    } else if (result === 'unchanged') {
      statusFinish('unchanged')
    } else {
      statusFail(failKey)
    }
    return result
  }

  const onAddProfileItem = async (item: Partial<ProfileItem>): Promise<ProfileUpdateResult> =>
    addProfileItemWithStatus(item, 'addFailed')

  const onRefreshSubscription = async (): Promise<void> => {
    if (!currentProfile || currentProfile.type !== 'remote' || refreshing) return
    setRefreshing(true)
    try {
      await addProfileItemWithStatus(currentProfile, 'refreshFailed')
    } finally {
      setRefreshing(false)
    }
  }

  const onValueChange = async (enable: boolean): Promise<void> => {
    setLoading(true)
    setLoadingDirection(enable ? 'connecting' : 'disconnecting')
    statusBegin()
    try {
      if (enable) {
        if (mainSwitchMode === 'tun') {
          await patchControledMihomoConfig({ tun: { enable: true }, dns: { enable: true } })
          await mihomoHotReloadConfig()
        } else {
          if (writeSysProxy && sysProxyMode == 'manual' && sysProxyDisabled) return
          await patchAppConfig({ proxyMode: true })
          await mihomoHotReloadConfig()
          if (writeSysProxy) {
            await triggerSysProxy(true, onlyActiveDevice)
          }
        }
      } else {
        const tunWasEnabled = tun?.enable ?? false
        const proxyModeWasEnabled = proxyMode
        if (tunWasEnabled) {
          await patchControledMihomoConfig({ tun: { enable: false } })
        }
        if (proxyModeWasEnabled) {
          if (writeSysProxy) {
            await triggerSysProxy(false, onlyActiveDevice)
          }
          await patchAppConfig({ proxyMode: false })
        }
        if (tunWasEnabled || proxyModeWasEnabled) {
          await mihomoHotReloadConfig()
        }
      }
      window.electron.ipcRenderer.send('updateFloatingWindow')
      window.electron.ipcRenderer.send('updateTrayMenu')
      await updateTrayIcon()
      statusFinish(enable ? 'connected' : 'disconnected')
    } catch (e) {
      statusFail('failed')
      notifyError(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <BasePage>
      {importOpen && (
        <EditInfoModal
          item={{ id: '', type: 'remote', name: '' } as ProfileItem}
          isCurrent={false}
          updateProfileItem={onAddProfileItem}
          onClose={() => setImportOpen(false)}
          hideAdvanced
        />
      )}
      {!hasProfiles ? (
        <div className="h-full w-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 max-w-75 p-7 text-center">
            <WifiOff className="size-16 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground">{t('pages.profiles.emptyTitle')}</h2>
            <p className="text-sm font-normal text-muted-foreground text-center">
              {t('pages.profiles.emptyContinue')}
              <br />
              {t('pages.profiles.emptyOr')}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
                onClick={() => setImportOpen(true)}
              >
                {t('pages.profiles.emptyPasteLink')}
              </button>
            </p>
          </div>
        </div>
      ) : (
        <div className="grid h-full grid-rows-[auto_minmax(0,1fr)_auto] px-3 pb-3">
          {currentProfile && (
            <div className="relative z-10 px-0.5 pt-3">
              <div
                data-guide="home-profile-header"
                className="flex min-w-0 items-center justify-center gap-3"
              >
                {currentProfile.logo && (
                  <img
                    src={currentProfile.logo}
                    alt=""
                    className="size-11 rounded-full object-cover shrink-0"
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                )}
                <div className="min-w-0 text-center">
                  <div>
                    <div className="relative inline-block max-w-full align-middle">
                      <div className="truncate text-xl font-semibold leading-tight text-foreground">
                        {currentProfile.name}
                      </div>
                      {currentProfile.type === 'remote' && (
                        <button
                          type="button"
                          title={t('common.refresh')}
                          aria-label={t('common.refresh')}
                          onClick={onRefreshSubscription}
                          disabled={refreshing}
                          className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2 text-muted-foreground/80 transition-colors hover:text-foreground/90 disabled:opacity-60"
                        >
                          <RefreshCcw
                            className={`size-4 ${refreshing ? 'animate-spin [animation-direction:reverse]' : ''}`}
                          />
                        </button>
                      )}
                    </div>
                  </div>
                  {supportHref && (
                    <button
                      data-guide="home-support-link"
                      type="button"
                      onClick={() => open(supportHref)}
                      className="mt-1 text-[11px] font-medium text-muted-foreground/80 transition-colors hover:text-foreground/90"
                    >
                      support
                    </button>
                  )}
                </div>
              </div>
              {currentProfile.announce && (
                <div
                  data-guide="home-profile-announce"
                  className="mt-2 text-center text-sm font-medium whitespace-pre-line text-foreground/90"
                >
                  {currentProfile.announce}
                </div>
              )}
              {subscription && showTrafficUsage && (
                <div className="mt-3 border-t border-stroke/65 pt-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs text-muted-foreground">
                        {t('pages.home.trafficRemaining')}
                      </span>
                      <span className="text-base font-semibold text-foreground">
                        {trafficTotal > 0 ? formatBytes(trafficRemaining) : t('pages.home.unlimited')}
                      </span>
                    </div>
                    <div className="flex flex-col items-center justify-end text-center">
                      <CharacterMorph
                        texts={[status]}
                        reserveTexts={statusWidthTexts}
                        interval={3000}
                        className="h-6 leading-none text-base text-foreground font-semibold"
                      />
                    </div>
                    <div className="flex flex-col items-center gap-1 text-center">
                      <span className="text-xs text-muted-foreground">{t('pages.home.expires')}</span>
                      <span className="text-base font-semibold text-foreground">{expireDate}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex min-h-0 flex-col items-center justify-start py-3">
            {(!subscription || !showTrafficUsage) && (
              <div className="mb-3 flex h-6 items-center justify-center">
                <CharacterMorph
                  texts={[status]}
                  reserveTexts={statusWidthTexts}
                  interval={3000}
                  className="h-6 leading-none text-foreground font-semibold"
                />
              </div>
            )}
            <button
              disabled={isDisabled}
              onClick={() => onValueChange(!isSelected)}
              data-guide="home-power-toggle"
              className="relative group transition-transform active:scale-95 cursor-pointer"
            >
              <div
                className={`size-[7.5rem] rounded-full flex items-center justify-center transition-all duration-300 border backdrop-blur-2xl shadow-[0_18px_48px_rgb(var(--glow-rgb)/0.20)] ${
                  isSelected
                    ? 'bg-linear-to-br from-gradient-start-power-on/80 to-gradient-end-power-on/80 border-stroke-power-on'
                    : 'bg-foreground text-background border-foreground/30 hover:brightness-110'
                } ${loading ? 'animate-none' : ''}`}
              >
                <div className="relative size-16">
                  <Spinner
                    className={`absolute inset-0 m-auto size-16 transition-all duration-300 ease-out ${
                      isSelected ? 'text-[#FAFAFA]' : 'text-background'
                    } ${loading ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
                  />
                  <PauseIcon
                    className={`absolute inset-0 size-16 stroke-[2.6] text-white transition-all duration-300 ease-out ${
                      !loading && isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                  <PowerIcon
                    className={`absolute inset-0 size-16 stroke-[2.6] transition-all duration-300 ease-out ${
                      !loading && !isSelected ? 'opacity-100 scale-100' : 'opacity-0 scale-90'
                    }`}
                  />
                </div>
              </div>
            </button>
            <div
              aria-hidden={!showConnectedTimer}
              className={`mt-4 inline-flex items-center gap-0.5 text-base font-semibold text-foreground tabular-nums transition-all duration-300 ease-out ${
                showConnectedTimer ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1'
              }`}
            >
              <NumberFlow
                value={elapsedHours}
                format={{ minimumIntegerDigits: 2, useGrouping: false }}
              />
              <span>:</span>
              <NumberFlow
                value={elapsedMinutes}
                format={{ minimumIntegerDigits: 2, useGrouping: false }}
              />
              <span>:</span>
              <NumberFlow
                value={elapsedSeconds}
                format={{ minimumIntegerDigits: 2, useGrouping: false }}
              />
            </div>
            <StatusLog />
          </div>

          <div className="relative z-10 px-0.5 pt-3">
            <div className="relative flex items-center justify-center border-t border-stroke/65 pt-2">
              <div
                aria-hidden={!showConnectedTimer}
                className={`absolute bottom-0 left-0 top-2 flex items-center gap-2.5 text-[11px] text-muted-foreground tabular-nums transition-opacity duration-300 ease-out ${
                  showConnectedTimer ? 'opacity-100' : 'opacity-0'
                }`}
              >
                <div className="flex items-center gap-1">
                  <ArrowUp className="size-3 text-stroke-power-on" />
                  <span>{calcTraffic(trafficInfo.upTotal)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <ArrowDown className="size-3 text-stroke-power-on" />
                  <span>{calcTraffic(trafficInfo.downTotal)}</span>
                </div>
              </div>
              {firstGroup && (
                <button
                  data-guide="home-group-selector"
                  type="button"
                  className="flex min-w-0 items-center justify-center gap-2 py-2 text-center transition-colors hover:text-foreground/90"
                  onClick={() => navigate('/proxies', { state: { fromHome: true } })}
                >
                  <div className="flag-emoji max-w-full truncate text-center text-sm font-medium text-foreground">
                    {firstGroup.now || firstGroup.name}
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </button>
              )}
              {globalModeAllowed && (
                <div
                  data-guide="home-full-toggle"
                  className="absolute bottom-0 right-0 top-2 flex items-center gap-2 rounded-full border border-stroke bg-card/50 backdrop-blur-xl pl-3 pr-2 shadow-sm"
                >
                  <span
                    onClick={() => !modeLoading && onToggleFull(!isGlobal)}
                    className={`text-xs font-semibold tracking-wider text-foreground select-none ${
                      modeLoading ? 'opacity-60' : 'cursor-pointer'
                    }`}
                  >
                    {t('pages.home.fullMode')}
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={t('pages.home.fullModeTooltip')}
                        className="flex items-center text-amber-500/90 transition-colors hover:text-amber-400 cursor-help"
                      >
                        <TriangleAlert className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[15rem]">
                      {t('pages.home.fullModeTooltip')}
                    </TooltipContent>
                  </Tooltip>
                  <Switch
                    size="sm"
                    checked={isGlobal}
                    disabled={modeLoading}
                    onCheckedChange={onToggleFull}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </BasePage>
  )
}

export default Home
