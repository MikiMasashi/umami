import { Button, Form, FormButtons, FormField, TextField } from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';
import {
  isWebsiteNotesValid,
  WEBSITE_NOTES_MAX_LENGTH,
  WEBSITE_NOTES_TOO_LONG_MESSAGE,
} from '@/lib/website-notes';

export function WebsiteEditForm({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const website = useWebsite();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);
  const values = website ? { ...website, notes: website.notes ?? '' } : website;
  const [isNotesTooLong, setIsNotesTooLong] = useState(false);

  useEffect(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="notes"]');

    if (!textarea) {
      return;
    }

    const handleBeforeInput = (event: InputEvent) => {
      const selectedLength = textarea.selectionEnd - textarea.selectionStart;
      const nextLength = textarea.value.length - selectedLength + (event.data?.length ?? 0);

      if (nextLength > WEBSITE_NOTES_MAX_LENGTH) {
        setIsNotesTooLong(true);
      }
    };

    const handleInput = () => {
      const length = textarea.value.length;
      setIsNotesTooLong(current =>
        current ? length >= WEBSITE_NOTES_MAX_LENGTH : length > WEBSITE_NOTES_MAX_LENGTH,
      );
    };

    textarea.addEventListener('beforeinput', handleBeforeInput);
    textarea.addEventListener('input', handleInput);

    return () => {
      textarea.removeEventListener('beforeinput', handleBeforeInput);
      textarea.removeEventListener('input', handleInput);
    };
  }, []);

  const handleSubmit = async (data: any) => {
    if (isNotesTooLong || !isWebsiteNotesValid(data.notes)) {
      setIsNotesTooLong(true);
      return;
    }

    const { shareId, ...updateData } = data;
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
      <FormField
        label="Notes"
        data-test="input-notes"
        name="notes"
        description={isNotesTooLong ? WEBSITE_NOTES_TOO_LONG_MESSAGE : undefined}
      >
        <TextField asTextArea resize="vertical" maxLength={WEBSITE_NOTES_MAX_LENGTH} />
      </FormField>
      <FormButtons>
        <Button type="submit" data-test="button-submit" variant="primary">
          {t(labels.save)}
        </Button>
      </FormButtons>
    </Form>
  );
}
