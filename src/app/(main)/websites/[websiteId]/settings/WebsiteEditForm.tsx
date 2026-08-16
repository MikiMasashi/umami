import { Form, FormButtons, FormField, FormSubmitButton, TextField } from '@umami/react-zen';
import { useMemo, useState } from 'react';
import { useLoginQuery, useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX, ROLES } from '@/lib/constants';

const NOTES_MAX_LENGTH = 500;

export function WebsiteEditForm({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const website = useWebsite();
  const { user } = useLoginQuery();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);
  const [notesError, setNotesError] = useState<string | null>(null);

  const values = useMemo(() => ({ ...website, notes: website?.notes ?? '' }), [website]);

  const canEdit =
    !!user &&
    (user.isAdmin ||
      user.role === ROLES.admin ||
      (website?.userId ? website.userId === user.id : true));

  const handleSubmit = async (data: any) => {
    const { shareId, ...updateData } = data;

    if (typeof updateData.notes === 'string' && Array.from(updateData.notes).length > NOTES_MAX_LENGTH) {
      setNotesError(t(messages.notesMaxLength));
      return;
    }

    setNotesError(null);

    await mutateAsync(updateData, {
      onSuccess: async () => {
        toast(t(messages.saved));
        touch('websites');
        touch(`website:${website.id}`);
        onSave?.();
      },
    });
  };

  return (
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={values}>
      <FormField name="id" label={t(labels.websiteId)}>
        <TextField data-test="text-field-websiteId" value={website?.id} isReadOnly allowCopy />
      </FormField>
      <FormField
        label={t(labels.name)}
        data-test="input-name"
        name="name"
        rules={{ required: t(labels.required) }}
      >
        <TextField />
      </FormField>
      <FormField
        label={t(labels.domain)}
        data-test="input-domain"
        name="domain"
        rules={{
          required: t(labels.required),
          pattern: {
            value: DOMAIN_REGEX,
            message: t(messages.invalidDomain),
          },
        }}
      >
        <TextField />
      </FormField>
      <FormField label={t(labels.notes)} data-test="input-notes" name="notes">
        <TextField asTextArea isReadOnly={!canEdit} />
      </FormField>
      {notesError && <div className="text-red-500">{notesError}</div>}
      <FormButtons>
        <FormSubmitButton data-test="button-submit" variant="primary">
          {t(labels.save)}
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}
