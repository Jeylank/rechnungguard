# Reminder QA Checklist

## Scope

Manual QA for local due-date reminders in RechnungGuard. Do not test real OCR or backend behavior.

## Setup

- Run the app on a device or simulator where local notifications can be allowed.
- Allow notification permissions when prompted.
- Use mock OCR documents or edit document fields manually in the review/detail flow.
- Verify reminder status on the document detail screen after each save.

## Cases

- [ ] Unpaid document with a due date 10 days in the future schedules 3 reminders:
  - 7 days before due date
  - 3 days before due date
  - on due date
  - Detail screen shows all scheduled reminder dates.

- [ ] Document with status `Offen` or `Prüfen` and a due date 2 days in the future schedules only the due-date reminder.
  - Detail screen does not show past 7-day or 3-day reminder dates.

- [ ] Document with status `Offen` or `Prüfen` and a past due date schedules no past reminders.
  - Detail screen shows that there are no future reminder dates.

- [ ] Marking a document as `Bezahlt` cancels existing reminders.
  - Detail screen shows that no reminder is needed.
  - No previously scheduled reminder for that document fires.

- [ ] Marking a document as `Erledigt` cancels existing reminders.
  - Detail screen shows that no reminder is needed.
  - No previously scheduled reminder for that document fires.

- [ ] Saving the same eligible document twice does not duplicate reminders.
  - Detail screen still shows only one 7-day, one 3-day, and one due-date reminder when all are in the future.
  - Only one notification fires for each scheduled reminder time.

## Permission Edge Case

- [ ] If notification permission is denied, saving an eligible document does not crash.
  - Detail screen shows that notifications are not allowed.
