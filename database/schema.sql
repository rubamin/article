/* Article Tracker - MSSQL schema (full, for a NEW database).
   Existing database from v1? Run database/migrations/002_admin_share_branding.sql instead.
   All times are stored in UTC (SYSUTCDATETIME). */

CREATE TABLE dbo.AdminUsers (
    AdminId      INT IDENTITY(1,1) PRIMARY KEY,
    Username     NVARCHAR(100) NOT NULL,
    FullName     NVARCHAR(200) NOT NULL,
    PasswordHash NVARCHAR(200) NOT NULL,
    IsActive     BIT NOT NULL DEFAULT 1,
    CreatedAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastLoginAt  DATETIME2 NULL,
    CONSTRAINT UQ_AdminUsers_Username UNIQUE (Username)
);

/* Images inside articles and header logos */
CREATE TABLE dbo.ArticleAssets (
    AssetId    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    AdminId    INT NOT NULL REFERENCES dbo.AdminUsers(AdminId),
    FileName   NVARCHAR(260) NULL,
    MimeType   VARCHAR(100) NOT NULL,
    SizeBytes  INT NOT NULL,
    Data       VARBINARY(MAX) NOT NULL,
    CreatedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE dbo.Articles (
    ArticleId     INT IDENTITY(1,1) PRIMARY KEY,
    Title         NVARCHAR(300)  NOT NULL,
    ContentHtml   NVARCHAR(MAX)  NOT NULL,
    ContentSource VARCHAR(10) NOT NULL DEFAULT 'HTML' CHECK (ContentSource IN ('HTML','WORD')),
    HeaderColor   CHAR(7) NOT NULL DEFAULT '#1D2B38',
    LogoAssetId   UNIQUEIDENTIFIER NULL REFERENCES dbo.ArticleAssets(AssetId),
    ShareToken    UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    IsShareActive BIT NOT NULL DEFAULT 1,
    CreatedBy     INT NULL REFERENCES dbo.AdminUsers(AdminId),
    CreatedAt     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    UpdatedAt     DATETIME2      NULL
);
CREATE UNIQUE INDEX UX_Articles_ShareToken ON dbo.Articles(ShareToken);
CREATE INDEX IX_Articles_CreatedBy ON dbo.Articles(CreatedBy);

CREATE TABLE dbo.ArticleQuestions (
    QuestionId   INT IDENTITY(1,1) PRIMARY KEY,
    ArticleId    INT NOT NULL REFERENCES dbo.Articles(ArticleId) ON DELETE CASCADE,
    SortOrder    INT NOT NULL,
    QuestionText NVARCHAR(1000) NOT NULL,
    QuestionType VARCHAR(10) NOT NULL CHECK (QuestionType IN ('MCQ','TEXT'))
);

CREATE TABLE dbo.QuestionOptions (
    OptionId     INT IDENTITY(1,1) PRIMARY KEY,
    QuestionId   INT NOT NULL REFERENCES dbo.ArticleQuestions(QuestionId) ON DELETE CASCADE,
    SortOrder    INT NOT NULL,
    OptionText   NVARCHAR(500) NOT NULL,
    IsCorrect    BIT NOT NULL DEFAULT 0
);

/* One row per person per article. Token is the secret part of their personal link.
   Source: INVITE = added by admin, LINK = joined through the article's share link. */
CREATE TABLE dbo.ArticleRecipients (
    RecipientId  INT IDENTITY(1,1) PRIMARY KEY,
    ArticleId    INT NOT NULL REFERENCES dbo.Articles(ArticleId) ON DELETE CASCADE,
    EmployeeName NVARCHAR(200) NOT NULL,
    Email        NVARCHAR(256) NOT NULL,
    Department   NVARCHAR(150) NULL,
    Token        UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID(),
    Source       VARCHAR(10) NOT NULL DEFAULT 'INVITE' CHECK (Source IN ('INVITE','LINK')),
    CreatedAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_ArticleRecipients_ArticleEmail UNIQUE (ArticleId, Email)
);
CREATE UNIQUE INDEX UX_ArticleRecipients_Token ON dbo.ArticleRecipients(Token);

/* One row every time the article is opened.
   Open duration   = OpenedAt -> COALESCE(ClosedAt, LastSeenAt)
   Active seconds  = time the reader was on the article: tab visible AND window focused
   Away seconds    = open, but the reader was on another tab / window / app
   Away count      = how many times the reader left the article */
CREATE TABLE dbo.ArticleViewSessions (
    SessionId     UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    RecipientId   INT NOT NULL REFERENCES dbo.ArticleRecipients(RecipientId) ON DELETE CASCADE,
    OpenedAt      DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    LastSeenAt    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    ClosedAt      DATETIME2 NULL,
    ActiveSeconds INT NOT NULL DEFAULT 0,
    AwaySeconds   INT NOT NULL DEFAULT 0,
    AwayCount     INT NOT NULL DEFAULT 0,
    MaxScrollPct  TINYINT NOT NULL DEFAULT 0,
    UserAgent     NVARCHAR(500) NULL,
    IpAddress     VARCHAR(64) NULL
);
CREATE INDEX IX_ArticleViewSessions_Recipient ON dbo.ArticleViewSessions(RecipientId);

/* One submission per recipient (UNIQUE on RecipientId). */
CREATE TABLE dbo.ArticleResponses (
    ResponseId   INT IDENTITY(1,1) PRIMARY KEY,
    RecipientId  INT NOT NULL UNIQUE REFERENCES dbo.ArticleRecipients(RecipientId) ON DELETE CASCADE,
    SubmittedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    McqCorrect   INT NOT NULL DEFAULT 0,
    McqTotal     INT NOT NULL DEFAULT 0
);

/* QuestionId / SelectedOptionId have NO cascade on purpose: SQL Server rejects
   multiple cascade paths. The API locks questions once any response exists. */
CREATE TABLE dbo.ResponseAnswers (
    AnswerId         INT IDENTITY(1,1) PRIMARY KEY,
    ResponseId       INT NOT NULL REFERENCES dbo.ArticleResponses(ResponseId) ON DELETE CASCADE,
    QuestionId       INT NOT NULL REFERENCES dbo.ArticleQuestions(QuestionId),
    SelectedOptionId INT NULL REFERENCES dbo.QuestionOptions(OptionId),
    AnswerText       NVARCHAR(MAX) NULL
);
CREATE INDEX IX_ResponseAnswers_Response ON dbo.ResponseAnswers(ResponseId);
