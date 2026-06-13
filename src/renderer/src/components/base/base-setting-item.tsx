import { Separator } from '@renderer/components/ui/separator'

import React from 'react'

interface Props {
  title: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  divider?: boolean
  /** highlight this row as changed-from-default (yellow) */
  highlight?: boolean
  /** small subtext shown under the title, e.g. "Default: Off" */
  defaultHint?: React.ReactNode
  /** DOM id for deep-link scroll targeting (e.g. "setting-<id>") */
  anchorId?: string
}

const SettingItem: React.FC<Props> = (props) => {
  const { title, actions, children, divider = false, highlight = false, defaultHint, anchorId } =
    props
  const showHint = highlight && defaultHint

  return (
    <>
      <div
        id={anchorId}
        className={`w-full flex items-center justify-between gap-4 ${
          showHint ? 'min-h-[44px] py-1' : 'h-[32px]'
        } ${
          highlight ? 'border-l-2 border-yellow-500/80 pl-3 -ml-3' : ''
        }`}
      >
        <div className={`flex ${showHint ? 'flex-col justify-center' : 'h-full items-center'}`}>
          <div className="flex items-center">
            <h4
              className={`text-md whitespace-nowrap ${
                showHint ? 'leading-tight' : 'h-full leading-[32px]'
              } ${highlight ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}`}
            >
              {title}
            </h4>
            <div>{actions}</div>
          </div>
          {showHint && (
            <span className="text-xs leading-tight text-yellow-600/90 dark:text-yellow-400/90">
              {defaultHint}
            </span>
          )}
        </div>
        {children}
      </div>
      {divider && <Separator className="my-2" />}
    </>
  )
}

export default SettingItem
