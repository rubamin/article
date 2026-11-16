/* Article Tracker - add "away" tracking to view sessions.
   AwaySeconds = time the article was open but the reader was on another tab, window or app.
   AwayCount   = how many times the reader left the article during that open.
   Run once on an EXISTING database (after 002). New installs: schema.sql already has these.
   Sessions recorded before this change keep 0 here. */

ALTER TABLE dbo.ArticleViewSessions ADD
    AwaySeconds INT NOT NULL CONSTRAINT DF_ArticleViewSessions_AwaySeconds DEFAULT 0,
    AwayCount   INT NOT NULL CONSTRAINT DF_ArticleViewSessions_AwayCount   DEFAULT 0;
GO
