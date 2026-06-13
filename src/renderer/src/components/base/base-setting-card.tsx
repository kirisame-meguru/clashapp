import React from 'react'
import { Card, CardContent } from '@renderer/components/ui/card'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@renderer/components/ui/accordion'

interface Props {
  title?: string
  children?: React.ReactNode
  className?: string
  /** start the accordion expanded (used for deep-linking to a setting inside it) */
  defaultOpen?: boolean
}

const SettingCard: React.FC<Props> = ({ title, children, className, defaultOpen }) => {
  return !title ? (
    <Card className={`${className} mx-2 mb-2`}>
      <CardContent>{children}</CardContent>
    </Card>
  ) : (
    <Accordion
      className={`${className} glass-surface mx-2 mb-2 px-6 rounded-lg text-card-foreground`}
      type="single"
      collapsible
      defaultValue={defaultOpen ? title : undefined}
    >
      <AccordionItem value={title}>
        <AccordionTrigger>{title}</AccordionTrigger>
        <AccordionContent>{children}</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

export default SettingCard
