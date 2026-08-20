import { Form, FormButtons, FormField, FormSubmitButton, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
import { useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';
import {
  WEBSITE_NOTES_MAX_LENGTH_ERROR,
  WEBSITE_NOTES_MAX_LENGTH,
} from '@/lib/website-notes';

export function WebsiteEditForm({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const website = useWebsite();
  const formValues = { ...website, notes: website?.notes ?? '' };
  const [notesError, setNotesError] = useState('');
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);

  const handleSubmit = async (data: any) => {
    const { shareId, notes = '', ...updateData } = data;

    if (notes.length > WEBSITE_NOTES_MAX_LENGTH) {
      setNotesError(WEBSITE_NOTES_MAX_LENGTH_ERROR);
      return;
    }

    setNotesError('');

    await mutateAsync({ ...updateData, notes }, {
      onSuccess: async () => {
        toast(t(messages.saved));
        touch('websites');
        touch(`website:${website.id}`);
        onSave?.();
      },
    });
  };

  return (
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={formValues}>
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
        <textarea
          onChange={() => {
            if (notesError) {
              setNotesError('');
            }
          }}
          style={{ minHeight: 110, resize: 'vertical', width: '100%' }}
        />
      </FormField>
      {notesError && <Text data-test="text-notes-error">{notesError}</Text>}
      <FormButtons>
        <FormSubmitButton data-test="button-submit" variant="primary">
          {t(labels.save)}
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}
