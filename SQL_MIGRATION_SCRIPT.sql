-- SQL Migration Script for 1RadAPI Database
-- Execute this on your SQL Server database

USE [1RadDatabase]
GO

BEGIN TRANSACTION;

-- Add new columns to Centers table
ALTER TABLE [dbo].[Centers] 
ADD [GstinNumber] NVARCHAR(15) NULL,
    [RegistrationNumber] NVARCHAR(100) NULL;

-- Add indexes for better performance
CREATE NONCLUSTERED INDEX [IX_Centers_GstinNumber] 
ON [dbo].[Centers] ([GstinNumber]);

CREATE NONCLUSTERED INDEX [IX_Centers_RegistrationNumber] 
ON [dbo].[Centers] ([RegistrationNumber]);

-- Add unique constraint for GSTIN (if needed)
ALTER TABLE [dbo].[Centers] 
ADD CONSTRAINT [UQ_Centers_GstinNumber] UNIQUE ([GstinNumber]);

-- Add comments/descriptions
EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'GST Identification Number (15 characters)', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Centers', 
    @level2type = N'COLUMN', @level2name = N'GstinNumber';

EXEC sys.sp_addextendedproperty 
    @name = N'MS_Description', 
    @value = N'Hospital Registration Number from State Health Department', 
    @level0type = N'SCHEMA', @level0name = N'dbo', 
    @level1type = N'TABLE', @level1name = N'Centers', 
    @level2type = N'COLUMN', @level2name = N'RegistrationNumber';

COMMIT TRANSACTION;
GO

-- Verify the changes
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    IS_NULLABLE,
    CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'Centers' 
AND COLUMN_NAME IN ('GstinNumber', 'RegistrationNumber');