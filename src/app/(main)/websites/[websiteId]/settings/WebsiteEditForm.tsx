import { Form, FormButtons, FormField, FormSubmitButton, TextField } from '@umami/react-zen';
import { useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { DOMAIN_REGEX } from '@/lib/constants';

export function WebsiteEditForm({ websiteId, onSave }: { websiteId: string; onSave?: () => void }) {
  const website = useWebsite();
  const { t, labels, messages, getErrorMessage } = useMessages();
  const { mutateAsync, error, touch, toast } = useUpdateQuery(`/websites/${websiteId}`);
  const canUpdate = website?.canUpdate !== false;
  // The notes column is nullable in the DB (pre-existing websites have `notes: null`).
  // react-hook-form's default values are passed straight through as the textarea's
  // controlled `value`, and React warns/errors on a `null` value for form controls.
  // Normalize to an empty string so the field is always a controlled string.
  const defaultValues = website ? { ...website, notes: website.notes ?? '' } : website;

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
    <Form onSubmit={handleSubmit} error={getErrorMessage(error)} values={defaultValues}>
      {(formValues: any) => (
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
            label={t(labels.notes)}
            data-test="input-notes"
            name="notes"
            rules={{
              maxLength: {
                value: 500,
                message: t(messages.notesTooLong),
              },
            }}
          >
            <TextField asTextArea isDisabled={!canUpdate} />
          </FormField>
          {canUpdate && (
            <FormButtons>
              {/*
                react-zen's FormSubmitButton reads formState.isValid to compute its own
                disabled state. Reading formState.isValid forces react-hook-form to
                (re)validate on every change, which would otherwise leave the button
                permanently disabled the moment an invalid value (e.g. notes over 500
                characters) is typed - before the user ever gets a chance to submit and
                see the validation message. Overriding isDisabled here keeps the button
                clickable so the submit attempt runs, surfaces the validation error, and
                still blocks the actual save (react-hook-form skips calling onSubmit for
                an invalid form).
              */}
              <FormSubmitButton
                data-test="button-submit"
                variant="primary"
                isDisabled={formValues.formState.isSubmitting}
              >
                {t(labels.save)}
              </FormSubmitButton>
            </FormButtons>
          )}
        </>
      )}
    </Form>
  );
}
