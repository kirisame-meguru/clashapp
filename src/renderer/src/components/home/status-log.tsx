import { AnimatePresence, motion } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { useStatusLogStore } from '@renderer/store/status-log-store'
import { cn } from '@renderer/lib/utils'

// Only the most recent lines are kept on screen; older ones scroll off and fade
// so the stack stays compact and never reaches up over the power button.
const MAX_VISIBLE = 3

/**
 * Transient status log shown near the bottom of the Home screen while a user
 * action (connect/disconnect/refresh/add) runs. Lines stream in from the backend,
 * the newest sits solid at the bottom, older ones dim, and the whole stack fades
 * away a couple of seconds after the action completes.
 *
 * Rendered as a bottom-anchored (`mt-auto`) flow element inside the flexible
 * middle row of the Home grid, so it occupies the empty gap above the "Fastest"
 * footer without overlapping the controls above it.
 */
const StatusLog: React.FC = () => {
  const { t } = useTranslation()
  const entries = useStatusLogStore((s) => s.entries)
  const visible = entries.slice(-MAX_VISIBLE)

  return (
    <div className="pointer-events-none mt-auto flex w-full flex-col items-center justify-end gap-0.5 pt-2">
      <AnimatePresence mode="popLayout" initial={false}>
        {visible.map((entry, i) => {
          // Gradient fade: the newest line (bottom) is solid, each older line
          // above it is progressively more transparent.
          const distanceFromBottom = visible.length - 1 - i
          const opacity = Math.max(0.2, 1 - distanceFromBottom * 0.35)
          return (
            <motion.div
              key={entry.id}
              layout
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{
                opacity,
                y: 0,
                filter: 'blur(0px)'
              }}
              exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
              transition={{ duration: 0.35, ease: [0.215, 0.61, 0.355, 1] }}
              className={cn(
                'text-center text-xs leading-tight tabular-nums',
                entry.terminal ? 'font-semibold' : 'font-medium',
                entry.state === 'error'
                  ? 'text-amber-500'
                  : entry.terminal
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              )}
            >
              {t(`pages.statusLog.${entry.key}`, entry.params)}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

export default StatusLog
