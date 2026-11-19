/* Article Tracker - v7
   Software tour: remembers which page tours each admin has already seen,
   so the tour opens by itself only the first time (on any computer).
   Run once on an EXISTING database, after 004 (in SSMS).
   New installs: database/schema.sql already has this column. */

IF COL_LENGTH('dbo.AdminUsers', 'ToursSeen') IS NULL
    ALTER TABLE dbo.AdminUsers ADD ToursSeen NVARCHAR(200) NULL;  -- comma list, e.g. 'list,editor,report'
GO
