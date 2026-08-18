import { Form, FormButtons, FormField, FormSubmitButton, Row, Text, TextField } from '@umami/react-zen';
import { z } from 'zod';
import { useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';

const MAX_NOTE_LENGTH = 500;

const schema = z.object({
  note: z.string().max(MAX_NOTE_LENGTH, { message: 'Note must be 500 characters or less' }).nullable().optional(),
});

export function WebsiteEditForm({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const website = useWebsite();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);

  const handleSubmit = async (data: any) => {
    const { shareId, ...updateData } = data;
    const parsed = schema.safeParse({
      note: updateData.note === '' ? null : updateData.note,
    });

    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || 'Note must be 500 characters or less');
    }

    await mutateAsync(
      {
        ...updateData,
        note: updateData.note === '' ? null : updateData.note,
      },
      {
        onSuccess: async () => {
          toast(t(messages.saved));
          touch('websites');
          touch(`website:${website.id}`);
          onSave?.();
        },
      },
    );
  };

  return (
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={website}>
      {({ watch }) => {
        const note = (watch('note') as string | null | undefined) ?? '';
        const noteLength = note.length;

        return (
          <>
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
              label={t(labels.note)}
              data-test="input-note"
              name="note"
              rules={{
                validate: value =>
                  !value || value.length <= MAX_NOTE_LENGTH || 'Note must be 500 characters or less',
              }}
            >
              <TextField asTextArea resize="vertical" />
            </FormField>
            <Row justifyContent="space-between" paddingTop="1" paddingBottom="3">
              <Text color="muted">
                {noteLength}/{MAX_NOTE_LENGTH}
              </Text>
              {noteLength > MAX_NOTE_LENGTH && <Text>Note must be 500 characters or less</Text>}
            </Row>
            <FormButtons>
              <FormSubmitButton data-test="button-submit" variant="primary">
                {t(labels.save)}
              </FormSubmitButton>
            </FormButtons>
          </>
        );
      }}
    </Form>
  );
}
