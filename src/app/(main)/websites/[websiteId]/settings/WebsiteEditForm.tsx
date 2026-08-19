import { Form, FormButtons, FormField, FormSubmitButton, TextField } from '@umami/react-zen';
import { useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';
import { WEBSITE_NOTES_MAX_LENGTH } from '@/lib/website-notes';

export function WebsiteEditForm({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const website = useWebsite();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);

  const handleSubmit = async (data: any) => {
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
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={website}>
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
        rules={{
          maxLength: {
            value: WEBSITE_NOTES_MAX_LENGTH,
            message: `Notes must be ${WEBSITE_NOTES_MAX_LENGTH} characters or fewer.`,
          },
        }}
      >
        <TextField asTextArea resize="vertical" />
      </FormField>
      <FormButtons>
        <FormSubmitButton data-test="button-submit" variant="primary">
          {t(labels.save)}
        </FormSubmitButton>
      </FormButtons>
    </Form>
  );
}
