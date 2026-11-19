/**
 * Software tour content, one tour per admin page.
 *
 * Each step: { el, title, text, side?, align? }
 *  - el: CSS selector of the thing to highlight (first match). Leave it out for a centred message.
 *  - Steps whose element is not on the screen are skipped (e.g. the article table when there are no articles yet),
 *    so one list works for every state of the page.
 *  - text may be a function (ctx) => string; ctx = { firstName }.
 *
 * To explain a new button: give it data-tour="something" and add a step here.
 */

export const TOUR_TITLES = {
  list: 'My articles',
  editor: 'Article editor',
  report: 'Article report',
};

export const TOURS = {
  list: [
    {
      title: (c) => `Welcome to Article Tracker${c.firstName ? `, ${c.firstName}` : ''}`,
      text: 'This short tour shows what each part of the screen does. Use Next and Back, or the arrow keys. '
        + 'Press Esc or Skip tour to close it — you can start it again any time.',
    },
    {
      el: '[data-tour="new-article"]',
      title: 'Create an article',
      text: 'Start here. Write the article or import a Word file, style its heading, and add the questions readers answer after reading.',
      side: 'bottom', align: 'end',
    },
    {
      el: '[data-tour="empty-articles"]',
      title: 'No articles yet',
      text: 'Your articles will be listed here once you create the first one.',
    },
    {
      el: '[data-tour="articles-table"]',
      title: 'Your articles',
      text: 'Every article you created. Readers = people who joined, Opened = people who opened it at least once, Answered = people who submitted the questions.',
      side: 'top',
    },
    {
      el: '[data-tour="article-title"]',
      title: 'Open the report',
      text: 'Click a title to see who read the article, how long they stayed, how far they scrolled and what they answered.',
    },
    {
      el: '[data-tour="copy-link"]',
      title: 'Copy the share link',
      text: 'Copies this article’s link. Paste it in email, Teams or WhatsApp. Readers enter their name and email once, then read. '
        + '“Closed” next to it means new people cannot join any more.',
    },
    {
      el: '[data-tour="row-actions"]',
      title: 'Report and Edit',
      text: 'Report shows the reading details. Edit changes the title, heading, content and questions (questions lock once someone has answered).',
      side: 'left',
    },
    {
      el: '[data-tour="tour-button"]',
      title: 'Software tour',
      text: 'Click here to see this tour again. The editor and the report have their own short tours — they open by themselves the first time you visit those pages.',
      side: 'bottom', align: 'end',
    },
    {
      el: '[data-tour="sign-out"]',
      title: 'Sign out',
      text: 'Sign out when you are done, especially on a shared computer. That’s the end of the tour.',
      side: 'bottom', align: 'end',
    },
  ],

  editor: [
    {
      title: 'Article editor',
      text: 'Here you write the article and its questions. Nothing is saved until you click Save article.',
    },
    {
      el: '[data-tour="article-title-field"]',
      title: 'Title',
      text: 'The article’s title. Readers see it in the heading band at the top.',
    },
    {
      el: '[data-tour="header-branding"]',
      title: 'Heading style',
      text: 'Choose the heading’s background colour, font colour and size, an optional subheading (for example the edition line) and a logo on the right. '
        + 'The preview shows exactly what readers will see. A new article starts with the look of your last one.',
      side: 'top',
    },
    {
      el: '[data-tour="content-mode"]',
      title: 'Word document or HTML code',
      text: 'Word document works like Microsoft Word. HTML code is for pasting ready-made HTML, with a live preview.',
    },
    {
      el: '[data-tour="import-docx"]',
      title: 'Import a Word file',
      text: 'Bring in a .docx file — text, headings, tables and pictures come in and stay editable. It replaces the current content.',
      side: 'left',
    },
    {
      el: '.word-editor .toolbar',
      title: 'Formatting toolbar',
      text: 'Headings, bold, lists, alignment, links, images and tables — just like Word. Click inside a table to add rows and columns.',
    },
    {
      el: '.html-editor',
      title: 'HTML and preview',
      text: 'Write or paste HTML on the left; the right side shows how it will look. “Insert image” uploads a picture at the cursor.',
      side: 'top',
    },
    {
      el: '[data-tour="questions-locked"]',
      title: 'Questions are locked',
      text: 'People have already answered this article, so its questions cannot change. Title, heading and content can still be edited.',
    },
    {
      el: '.quiz-head-card',
      title: 'Quiz heading',
      text: 'The heading and note readers see above the questions. You can change them even after people have answered.',
    },
    {
      el: '.questions .q-card .type-select',
      title: 'Question type',
      text: 'Pick a type: multiple choice, checkboxes, dropdown, short answer, rating, scale, grid, date, file upload and more.',
      side: 'left',
    },
    {
      el: '.questions .q-card .q-text',
      title: 'Question text',
      text: 'Type the question here. Tick “Description” below to add help text under it.',
    },
    {
      el: '.questions .correct-btn',
      title: 'Mark the correct answer',
      text: 'Mark the right option to score the question — the report then shows “x/y correct”. Leave it unmarked for an opinion question.',
      side: 'left',
    },
    {
      el: '.questions .q-toggles',
      title: 'Question settings',
      text: 'Required makes the reader answer before submitting. Description adds help text. Shuffle shows the options in a random order to each reader.',
    },
    {
      el: '.questions .q-actions',
      title: 'Move, duplicate, delete',
      text: 'Use the arrows to change the order, Duplicate to copy a question, and Delete to remove it.',
      side: 'left',
    },
    {
      el: '.q-add-bar',
      title: 'Add a question',
      text: 'An article can have 1 to 20 questions.',
    },
    {
      el: '[data-tour="save-article"]',
      title: 'Save',
      text: 'Save the article. You are taken to its report, where you can copy the share link.',
      side: 'bottom', align: 'end',
    },
  ],

  report: [
    {
      title: 'Article report',
      text: 'This page shows who read the article and how. It refreshes by itself every 30 seconds while it is open.',
    },
    {
      el: '[data-tour="share-link"]',
      title: 'Share link',
      text: 'The one link for this article. Copy it, or send it with the Email and Teams buttons. Anyone with it enters their name and email once, then reads.',
    },
    {
      el: '[data-tour="share-toggle"]',
      title: 'Open or close the link',
      text: 'Turn this off to stop new people joining. People who already joined can still open the article.',
      side: 'left',
    },
    {
      el: '[data-tour="stats"]',
      title: 'Summary',
      text: 'On page = time the article was in front of the reader. Away = time it was open while they were in another tab or app. Times left = how often they switched away.',
    },
    {
      el: '[data-tour="empty-report"]',
      title: 'No readers yet',
      text: 'Once people open the link, each reader appears here as a row.',
    },
    {
      el: '[data-tour="readers-table"]',
      title: 'Readers',
      text: 'One row per reader: how many times they opened it, time on page, time away, how far they scrolled, and their quiz result.',
      side: 'top',
    },
    {
      el: '[data-tour="reader-row"]',
      title: 'Reader details',
      text: 'Click a row to see every time they opened the article and each answer they gave. Uploaded files can be downloaded from there.',
    },
    {
      el: '[data-tour="export-csv"]',
      title: 'Export to Excel',
      text: 'Downloads the whole table as a CSV file that opens in Excel (Gujarati and Hindi names display correctly).',
      side: 'bottom', align: 'end',
    },
    {
      el: '[data-tour="edit-article"]',
      title: 'Edit article',
      text: 'Change the title, heading or content. Questions are locked once someone has answered.',
      side: 'bottom', align: 'end',
    },
    {
      el: '[data-tour="invite"]',
      title: 'Personal links (optional)',
      text: 'For a fixed list of people: paste Name, Email, Department (columns from Excel work) and each person gets their own link — they are not asked for their details.',
      side: 'top',
    },
  ],
};
