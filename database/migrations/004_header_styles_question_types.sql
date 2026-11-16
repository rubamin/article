/* Article Tracker - v6
   1. Heading + subheading styling (font colour, background colour, font size)
   2. Quiz section heading and note per article
   3. Any number of questions (1-20) with all Google Forms / Microsoft Forms question types
   4. File upload answers
   Run once on an EXISTING database, after 003 (in SSMS - it uses GO).
   New installs: database/schema.sql already has all of this. */

/* ---------- 1 + 2: article header and quiz heading ---------- */
ALTER TABLE dbo.Articles ADD
    HeadingColor CHAR(7)        NULL,                                                   -- NULL = automatic (readable on the header colour)
    HeadingSize  SMALLINT       NOT NULL CONSTRAINT DF_Articles_HeadingSize DEFAULT 40, -- px
    SubTitle     NVARCHAR(300)  NULL,
    SubColor     CHAR(7)        NULL,                                                   -- NULL = automatic
    SubBgColor   CHAR(7)        NULL,                                                   -- NULL = same as the header colour
    SubSize      SMALLINT       NOT NULL CONSTRAINT DF_Articles_SubSize DEFAULT 20,     -- px
    QuizTitle    NVARCHAR(300)  NULL,                                                   -- NULL = "Check your understanding"
    QuizNote     NVARCHAR(1000) NULL;
GO

/* ---------- 3: question types ----------
   The old CHECK constraint on QuestionType has a generated name, so find it and drop it. */
DECLARE @ck SYSNAME, @cmd NVARCHAR(400);
SELECT @ck = cc.name
FROM sys.check_constraints cc
JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
WHERE cc.parent_object_id = OBJECT_ID('dbo.ArticleQuestions') AND c.name = 'QuestionType';
IF @ck IS NOT NULL
BEGIN
    SET @cmd = N'ALTER TABLE dbo.ArticleQuestions DROP CONSTRAINT ' + QUOTENAME(@ck);
    EXEC (@cmd);
END
GO

ALTER TABLE dbo.ArticleQuestions ALTER COLUMN QuestionType VARCHAR(20) NOT NULL;
GO

ALTER TABLE dbo.ArticleQuestions ADD
    Description NVARCHAR(1000) NULL,
    IsRequired  BIT NOT NULL CONSTRAINT DF_ArticleQuestions_IsRequired DEFAULT 1,
    Shuffle     BIT NOT NULL CONSTRAINT DF_ArticleQuestions_Shuffle DEFAULT 0,
    Settings    NVARCHAR(MAX) NULL;   -- JSON: scale range, rating levels, grid rows/columns, file rules, ...
GO

/* MCQ = multiple choice, TEXT = paragraph (both existed before) */
ALTER TABLE dbo.ArticleQuestions ADD CONSTRAINT CK_ArticleQuestions_Type CHECK (QuestionType IN
    ('SHORT','TEXT','MCQ','CHECKBOX','DROPDOWN','SCALE','RATING','GRID','CHECKGRID','LIKERT',
     'RANKING','NPS','DATE','TIME','FILE'));
GO

ALTER TABLE dbo.QuestionOptions ALTER COLUMN OptionText NVARCHAR(500) NOT NULL;
GO

/* ---------- answers: structured value + per-answer result ---------- */
ALTER TABLE dbo.ResponseAnswers ADD
    AnswerJson NVARCHAR(MAX) NULL,   -- the answer as given (checkbox list, grid, ranking order, files ...)
    IsCorrect  BIT NULL;             -- NULL = question is not graded
GO

/* ---------- 4: files uploaded by readers (File upload questions) ----------
   QuestionId has no foreign key on purpose: questions are re-created when an article is edited
   before anyone submits, and a reader may have uploaded a file in the meantime. */
CREATE TABLE dbo.ResponseFiles (
    FileId      UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    RecipientId INT NOT NULL REFERENCES dbo.ArticleRecipients(RecipientId) ON DELETE CASCADE,
    QuestionId  INT NOT NULL,
    FileName    NVARCHAR(260) NOT NULL,
    MimeType    VARCHAR(100) NOT NULL,
    SizeBytes   INT NOT NULL,
    Data        VARBINARY(MAX) NOT NULL,
    CreatedAt   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_ResponseFiles_Recipient ON dbo.ResponseFiles(RecipientId, QuestionId);
GO
