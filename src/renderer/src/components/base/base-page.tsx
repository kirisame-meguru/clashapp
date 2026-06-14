import { Button } from '@renderer/components/ui/button'
import { platform } from '@renderer/utils/init'
import WindowControls from '@renderer/components/window-controls'
import React, { forwardRef, useImperativeHandle, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, TriangleAlert, Home } from 'lucide-react'
import { useChangedSettings } from '@renderer/hooks/use-changed-settings'
import {
  ProfileIcon,
  ProxiesIcon,
  ConnectionsIcon,
  RulesIcon,
  LogsIcon,
  SettingsIcon
} from '@renderer/components/icons/sidebar-icons'
import { useTranslation } from 'react-i18next'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useScrollToFocusedSetting } from '@renderer/hooks/use-setting-focus'

const sidebarPaths = new Set(['/home'])
const isMac = platform === 'darwin'

const navButtons = [
  { path: '/settings', icon: SettingsIcon, i18nKey: 'common.settings' },
  { path: '/profiles', icon: ProfileIcon, i18nKey: 'sider.profileManagement', configKey: 'enableProfilesTab' },
  { path: '/proxies', icon: ProxiesIcon, i18nKey: 'sider.proxyGroup', configKey: 'enableProxiesTab' },
  { path: '/connections', icon: ConnectionsIcon, i18nKey: 'sider.connection', configKey: 'enableConnectionsTab' },
  { path: '/rules', icon: RulesIcon, i18nKey: 'sider.rules', configKey: 'enableRulesTab' },
  { path: '/logs', icon: LogsIcon, i18nKey: 'sider.logs', configKey: 'enableLogsTab' }
] as const

interface Props {
  title?: React.ReactNode
  header?: React.ReactNode
  children?: React.ReactNode
  contentClassName?: string
  showBackButton?: boolean
}

const BasePage = forwardRef<HTMLDivElement, Props>((props, ref) => {
  const { t } = useTranslation()
  const location = useLocation()
  const navigate = useNavigate()
  const { appConfig } = useAppConfig()
  const { count: changedCount } = useChangedSettings()
  const isSubPage = !sidebarPaths.has(location.pathname)
  const showHomeButton = isSubPage && location.pathname !== '/settings/changed'

  // Tabs are top-level destinations: collapse the current entry onto Home before
  // pushing the tab, so Back from any tab always returns to Home — even if sub-pages
  // (e.g. the VNI page) were visited in between.
  const navigateToTab = (path: string): void => {
    if (location.pathname === path) {
      navigate('/home')
      return
    }
    if (location.pathname !== '/home') {
      navigate('/home', { replace: true })
    }
    navigate(path)
  }

  useScrollToFocusedSetting()

  const contentRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => {
    return contentRef.current as HTMLDivElement
  })

  return (
    <div ref={contentRef} className="w-full h-full">
      <div className="sticky top-0 z-40 h-10 w-full border-b border-stroke/55 bg-background/20 backdrop-blur-2xl">
        <div className="app-drag flex h-10 items-stretch justify-between pl-2.5">
          <div className="title h-full text-[14px] leading-7 flex items-center gap-1">
            {navButtons.map((item) => {
              if ('configKey' in item && !appConfig?.[item.configKey]) {
                return null
              }
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Button
                  key={item.path}
                  size="icon-sm"
                  variant="ghost"
                  title={t(item.i18nKey)}
                  className={`app-nodrag ${isActive ? 'bg-accent/70 text-foreground' : ''}`}
                  onClick={() => navigateToTab(item.path)}
                >
                  <Icon className="size-4" />
                </Button>
              )
            })}
            {(isSubPage || props.showBackButton) && (
              <Button
                size="icon-sm"
                variant="ghost"
                className="app-nodrag"
                onClick={() => navigate(-1)}
              >
                <ChevronLeft className="size-5" />
              </Button>
            )}
          </div>
          <div className="header flex h-full items-stretch">
            {(changedCount > 0 || props.header || showHomeButton) && (
              <div className="flex items-center gap-1 pr-1.5">
                {props.header}
                {changedCount > 0 && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="app-nodrag text-yellow-500 hover:text-yellow-600"
                    title={t('pages.home.settingsChangedHint')}
                    onClick={() => navigateToTab('/settings/changed')}
                  >
                    <TriangleAlert className="size-4" />
                  </Button>
                )}
                {showHomeButton && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="app-nodrag"
                    title={t('sider.home')}
                    onClick={() => navigate('/home')}
                  >
                    <Home className="size-4" />
                  </Button>
                )}
              </div>
            )}
            {!isMac && <WindowControls />}
          </div>
        </div>
      </div>
      <div className="content h-[calc(100vh-40px)] overflow-y-auto custom-scrollbar pt-2">
        {props.children}
      </div>
    </div>
  )
})

BasePage.displayName = 'BasePage'
export default BasePage
