/** Entity Framework Core: generated from the EF Core packages' reference docs. */
module.exports = {
  id: 'efcore',
  languages: ['csharp'],
  generate: 'efcore',
  signals: [
    String.raw`^\s*using\s+Microsoft\.EntityFrameworkCore\b`,
    String.raw`\bDbContext\b`,
    String.raw`\bDbSet<`,
    String.raw`\.(?:SaveChangesAsync|AsNoTracking|ThenInclude|ToListAsync|FirstOrDefaultAsync|SingleOrDefaultAsync)\s*\(`,
  ],
  // Types come from these namespaces only (the ones `using` lines bring in).
  typeNamespaces: [
    'Microsoft.EntityFrameworkCore', 'Microsoft.EntityFrameworkCore.Metadata.Builders', 'Microsoft.EntityFrameworkCore.ChangeTracking',
    'Microsoft.EntityFrameworkCore.Migrations', 'Microsoft.EntityFrameworkCore.Storage', 'Microsoft.EntityFrameworkCore.Infrastructure',
  ],
  valueTypes: [
    'Microsoft.EntityFrameworkCore.DbSet', 'Microsoft.EntityFrameworkCore.DbContext', 'System.Linq.IQueryable',
    'Microsoft.EntityFrameworkCore.ModelBuilder', 'Microsoft.EntityFrameworkCore.Metadata.Builders.EntityTypeBuilder',
    'Microsoft.EntityFrameworkCore.Metadata.Builders.PropertyBuilder', 'Microsoft.EntityFrameworkCore.Metadata.Builders.ReferenceNavigationBuilder',
    'Microsoft.EntityFrameworkCore.Metadata.Builders.CollectionNavigationBuilder', 'Microsoft.EntityFrameworkCore.Metadata.Builders.ReferenceCollectionBuilder',
    'Microsoft.EntityFrameworkCore.DbContextOptionsBuilder', 'Microsoft.EntityFrameworkCore.Infrastructure.DatabaseFacade',
    'Microsoft.EntityFrameworkCore.Migrations.MigrationBuilder',
  ],
};
