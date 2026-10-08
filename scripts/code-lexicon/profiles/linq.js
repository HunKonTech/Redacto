/** LINQ (System.Linq): generated from the .NET reference-assembly docs. */
module.exports = {
  id: 'linq',
  languages: ['csharp'],
  generate: 'linq',
  signals: [
    String.raw`^\s*using\s+System\.Linq\s*;`,
    String.raw`\.(?:Where|Select|SelectMany|FirstOrDefault|SingleOrDefault|OrderBy|OrderByDescending|ThenBy|GroupBy|ToList|ToArray|ToDictionary|Distinct|Aggregate)\s*\(`,
  ],
};
