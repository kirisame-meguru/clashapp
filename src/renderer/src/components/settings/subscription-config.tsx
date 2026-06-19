import React, { useEffect, useState } from 'react'
import SettingCard from '../base/base-setting-card'
import SettingItem from '../base/base-setting-item'
import { Switch } from '@renderer/components/ui/switch'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { Spinner } from '@renderer/components/ui/spinner'
import { useAppConfig } from '@renderer/hooks/use-app-config'
import { useProfileConfig } from '@renderer/hooks/use-profile-config'
import { useTranslation } from 'react-i18next'

const SubscriptionConfig: React.FC = () => {
  const { t } = useTranslation()
  const { appConfig, patchAppConfig } = useAppConfig()
  const { showTrafficUsage = true } = appConfig || {}
  const { profileConfig, addProfileItem } = useProfileConfig()

  const firstProfile = profileConfig?.items?.[0]
  const [url, setUrl] = useState(firstProfile?.url ?? '')
  const [applying, setApplying] = useState(false)

  // Reflect the first profile's URL when it changes (e.g. after an update or
  // when the profile list loads/changes from elsewhere).
  useEffect(() => {
    setUrl(firstProfile?.url ?? '')
  }, [firstProfile?.url])

  const handleApply = async (): Promise<void> => {
    const trimmed = url.trim()
    if (!trimmed || applying) return
    setApplying(true)
    try {
      if (firstProfile) {
        // Change the first profile's subscription URL and refresh it in place.
        await addProfileItem({ ...firstProfile, type: 'remote', url: trimmed })
      } else {
        // No profile yet: create one from this URL and set it as the default.
        await addProfileItem({ type: 'remote', url: trimmed })
      }
    } finally {
      setApplying(false)
    }
  }

  return (
    <SettingCard>
      <SettingItem title={t('settings.subscription.showTrafficUsage')} divider>
        <Switch
          checked={showTrafficUsage}
          onCheckedChange={(value) => patchAppConfig({ showTrafficUsage: value })}
        />
      </SettingItem>
      <div className="flex flex-col gap-2">
        <h4 className="text-md whitespace-nowrap">{t('settings.subscription.subscriptionUrl')}</h4>
        <div className="flex gap-2">
          <Input
            className="h-9 flex-1"
            value={url}
            placeholder={t('profile.urlPlaceholder')}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleApply()
            }}
          />
          <Button onClick={handleApply} disabled={applying || !url.trim()}>
            <span className="relative inline-flex items-center justify-center">
              {applying && <Spinner className="size-4 absolute" />}
              <span className={applying ? 'invisible' : undefined}>
                {t('settings.subscription.apply')}
              </span>
            </span>
          </Button>
        </div>
      </div>
    </SettingCard>
  )
}

export default SubscriptionConfig
