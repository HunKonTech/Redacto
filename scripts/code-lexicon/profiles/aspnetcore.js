/** ASP.NET Core: generated from the Microsoft.AspNetCore.App reference docs. */
module.exports = {
  id: 'aspnetcore',
  languages: ['csharp'],
  generate: 'aspnetcore',
  signals: [
    String.raw`^\s*using\s+Microsoft\.AspNetCore\b`,
    String.raw`\[(?:ApiController|HttpGet|HttpPost|HttpPut|HttpDelete|HttpPatch|Route|Authorize|AllowAnonymous|FromBody|FromQuery|FromRoute)\b`,
    String.raw`\bWebApplication\.CreateBuilder\b`,
    String.raw`\b(?:IActionResult|ControllerBase)\b`,
  ],
  // Types come from these namespaces only (the ones `using` lines bring in).
  typeNamespaces: [
    'Microsoft.AspNetCore.Mvc', 'Microsoft.AspNetCore.Mvc.Filters', 'Microsoft.AspNetCore.Mvc.ModelBinding', 'Microsoft.AspNetCore.Builder',
    'Microsoft.AspNetCore.Http', 'Microsoft.AspNetCore.Http.HttpResults', 'Microsoft.AspNetCore.Authorization', 'Microsoft.AspNetCore.Authentication',
    'Microsoft.AspNetCore.Routing', 'Microsoft.AspNetCore.Hosting', 'Microsoft.AspNetCore.Identity', 'Microsoft.AspNetCore.SignalR',
    'Microsoft.AspNetCore.Cors', 'Microsoft.AspNetCore.Diagnostics', 'Microsoft.Extensions.DependencyInjection', 'Microsoft.Extensions.Logging',
    'Microsoft.Extensions.Configuration', 'Microsoft.Extensions.Hosting', 'Microsoft.Extensions.Options', 'Microsoft.Extensions.Caching.Memory',
    'Microsoft.Extensions.Caching.Distributed',
  ],
  keep: ['Results', 'Controller'],
  // Called without a receiver inside a controller (`return Ok(dto);`).
  bareCallTypes: ['Microsoft.AspNetCore.Mvc.ControllerBase', 'Microsoft.AspNetCore.Mvc.Controller'],
  valueTypes: [
    'Microsoft.Extensions.DependencyInjection.IServiceCollection', 'Microsoft.AspNetCore.Builder.WebApplication',
    'Microsoft.AspNetCore.Builder.WebApplicationBuilder', 'Microsoft.AspNetCore.Builder.IApplicationBuilder',
    'Microsoft.AspNetCore.Routing.IEndpointRouteBuilder', 'Microsoft.AspNetCore.Builder.IEndpointConventionBuilder',
    'Microsoft.AspNetCore.Builder.RouteHandlerBuilder', 'Microsoft.Extensions.Hosting.IHost', 'Microsoft.Extensions.Hosting.IHostEnvironment',
    'Microsoft.AspNetCore.Hosting.IWebHostEnvironment', 'Microsoft.Extensions.Logging.ILogger', 'Microsoft.Extensions.Configuration.IConfiguration',
    'Microsoft.AspNetCore.Http.HttpContext', 'Microsoft.AspNetCore.Http.HttpRequest', 'Microsoft.AspNetCore.Http.HttpResponse',
    'Microsoft.Extensions.DependencyInjection.IMvcBuilder',
  ],
};
