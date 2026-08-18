import { Button, Column, Form, Text } from '@umami/react-zen';
import { useEffect, useState, type FormEvent } from 'react';
import { useLoginQuery, useMessages, useUpdateQuery, useWebsite } from '@/components/hooks';
import { ROLES } from '@/lib/constants';
import { NOTES_VALIDATION_MESSAGE, notesSchema } from '@/lib/notes';

const successMessage = 'メモが保存されました';

export function WebsiteNotesSection({ websiteId }: { websiteId: string }) {
  const website = useWebsite();
  const { user } = useLoginQuery();
  const { getErrorMessage } = useMessages();
  const { mutateAsync, error, isPending = false, touch, toast } = useUpdateQuery(`/websites/${websiteId}/notes`);
  const [notes, setNotes] = useState(website?.notes ?? '');
  const [success, setSuccess] = useState('');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    setNotes(website?.notes ?? '');
  }, [website?.notes]);

  const isReadOnly = user?.role === ROLES.viewOnly;
  const serverError = getErrorMessage(error);
  const displayedError = validationError || serverError || '';
  const isSubmitDisabled = isReadOnly || isPending || !!validationError;

  const validateNotes = (value: string) => {
    const result = notesSchema.safeParse(value);
    const nextError = result.success ? '' : NOTES_VALIDATION_MESSAGE;
    setValidationError(nextError);
    return result.success;
  };

  const handleSubmit = async () => {
    setSuccess('');

    if (!validateNotes(notes)) {
      return;
    }

    const response = await mutateAsync(
      { notes },
      {
        onSuccess: async (data: any) => {
          const nextNotes = data?.notes ?? '';
          setNotes(nextNotes);
          setSuccess(successMessage);
          touch('websites');
          touch(`website:${websiteId}`);
        },
      },
    );

    if (response && typeof response === 'object' && 'notes' in response) {
      const nextNotes = response.notes ?? '';
      setNotes(nextNotes);
      setSuccess(successMessage);
      toast(successMessage);
    }
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Column gap="3">
        <textarea
          data-test="notes-input"
          value={notes}
          onChange={event => {
            setNotes(event.currentTarget.value);
            validateNotes(event.currentTarget.value);
          }}
          disabled={isReadOnly}
        />
        {displayedError && (
          <Text color="danger" data-test="notes-error-message">
            {displayedError}
          </Text>
        )}
        {success && (
          <Text color="success" data-test="notes-success-message">
            {success}
          </Text>
        )}
        <Button type="submit" variant="primary" isDisabled={isSubmitDisabled} data-test="notes-save-button">
          保存
        </Button>
      </Column>
    </Form>
  );
}
