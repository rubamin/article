/* Upgrade an EXISTING Article Tracker database (created with the first schema.sql).
   Adds: admin users, image/logo storage, one share link per article,
         content source (Word / HTML), header colour + logo.
   Safe to run once. New installs: just run database/schema.sql instead. */

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
GO

/* Images used inside articles and header logos, stored in the database
   so deployment needs no shared upload folder. */
CREATE TABLE dbo.ArticleAssets (
    AssetId    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    AdminId    INT NOT NULL REFERENCES dbo.AdminUsers(AdminId),
    FileName   NVARCHAR(260) NULL,
    MimeType   VARCHAR(100) NOT NULL,
    SizeBytes  INT NOT NULL,
    Data       VARBINARY(MAX) NOT NULL,
    CreatedAt  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
GO

ALTER TABLE dbo.Articles ADD
    CreatedBy     INT NULL CONSTRAINT FK_Articles_CreatedBy REFERENCES dbo.AdminUsers(AdminId),
    ShareToken    UNIQUEIDENTIFIER NULL,
    ContentSource VARCHAR(10) NOT NULL CONSTRAINT DF_Articles_ContentSource DEFAULT 'HTML',
    HeaderColor   CHAR(7) NOT NULL CONSTRAINT DF_Articles_HeaderColor DEFAULT '#1D2B38',
    LogoAssetId   UNIQUEIDENTIFIER NULL CONSTRAINT FK_Articles_Logo REFERENCES dbo.ArticleAssets(AssetId),
    IsShareActive BIT NOT NULL CONSTRAINT DF_Articles_IsShareActive DEFAULT 1;
GO

UPDATE dbo.Articles SET ShareToken = NEWID() WHERE ShareToken IS NULL;
ALTER TABLE dbo.Articles ALTER COLUMN ShareToken UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE dbo.Articles ADD CONSTRAINT DF_Articles_ShareToken DEFAULT NEWID() FOR ShareToken;
ALTER TABLE dbo.Articles ADD CONSTRAINT CK_Articles_ContentSource CHECK (ContentSource IN ('HTML','WORD'));
CREATE UNIQUE INDEX UX_Articles_ShareToken ON dbo.Articles(ShareToken);
CREATE INDEX IX_Articles_CreatedBy ON dbo.Articles(CreatedBy);
GO

/* INVITE = added by admin with a personal link, LINK = joined through the share link */
ALTER TABLE dbo.ArticleRecipients ADD
    Source VARCHAR(10) NOT NULL CONSTRAINT DF_ArticleRecipients_Source DEFAULT 'INVITE';
GO
ALTER TABLE dbo.ArticleRecipients ADD CONSTRAINT CK_ArticleRecipients_Source CHECK (Source IN ('INVITE','LINK'));
GO
