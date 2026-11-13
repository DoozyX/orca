import React, { useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useTranslate } from '@/i18n/use-translate'
import type { ClaudeAccountAssignment } from '../../../../shared/claude-account-assignment'
import { ClaudeAccountPicker } from '../claude-account-assignment/ClaudeAccountPicker'
import { claudeAccountFollowLabel } from '../claude-account-assignment/claude-account-follow-label'
import { useClaudeAccountChoices } from '../claude-account-assignment/use-claude-account-choices'

export type ProjectGroupSettingsDialogProps = {
  groupName: string
  /** The group's own assignment; a parent's shows up through `inherited` instead. */
  claudeAccountId: string | null
  inherited: ClaudeAccountAssignment | null
  onOpenChange: (open: boolean) => void
  /** Resolves false when the write was refused or could not be confirmed. */
  onSubmit: (claudeAccountId: string | null) => Promise<boolean>
}

export function ProjectGroupSettingsDialog({
  groupName,
  claudeAccountId,
  inherited,
  onOpenChange,
  onSubmit
}: ProjectGroupSettingsDialogProps): React.JSX.Element {
  const t = useTranslate()
  const pickerId = useId()
  const accounts = useClaudeAccountChoices()
  const [draft, setDraft] = useState(claudeAccountId)
  const [submitting, setSubmitting] = useState(false)

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    setSubmitting(true)
    const saved = await onSubmit(draft)
    setSubmitting(false)
    if (saved) {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              {t('auto.components.sidebar.ProjectGroupSettingsDialog.title', 'Group Settings')}
            </DialogTitle>
            <DialogDescription>
              {t(
                'auto.components.sidebar.ProjectGroupSettingsDialog.description',
                'Settings for {{value0}} and the groups nested inside it.',
                { value0: groupName }
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={pickerId}>
              {t('auto.components.claudeAccountAssignment.label', 'Claude account')}
            </Label>
            <ClaudeAccountPicker
              id={pickerId}
              value={draft}
              accounts={accounts}
              followLabel={claudeAccountFollowLabel(inherited, accounts, t)}
              disabled={submitting}
              ariaLabel={t('auto.components.claudeAccountAssignment.label', 'Claude account')}
              onChange={setDraft}
            />
            <p className="text-xs text-muted-foreground">
              {accounts.length > 0
                ? t(
                    'auto.components.claudeAccountAssignment.groupHint',
                    'Claude terminals and chats in this group run under this account. A project can override it in its settings.'
                  )
                : t(
                    'auto.components.claudeAccountAssignment.noAccounts',
                    'Add a Claude account in Settings → Accounts to assign one here.'
                  )}
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm-compact"
              disabled={submitting}
              onClick={() => onOpenChange(false)}
            >
              {t('auto.components.sidebar.ProjectGroupSettingsDialog.cancel', 'Cancel')}
            </Button>
            <Button type="submit" size="sm-compact" disabled={submitting}>
              {submitting
                ? t('auto.components.sidebar.ProjectGroupSettingsDialog.saving', 'Saving...')
                : t('auto.components.sidebar.ProjectGroupSettingsDialog.save', 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
