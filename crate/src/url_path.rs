//! Links and filesystem paths that point at something private.
//!
//! Public references (`https://docs.python.org/3/library/re.html`,
//! `/usr/local/bin`) stay untouched so the model can still use them. A link
//! becomes a span when it reaches an internal system, carries credentials or
//! an identifier, or opens a private document or a personal profile; a path
//! becomes a span when it names an account or a network share, or carries an
//! identifier. These run on every text, not only in code mode.

use regex::Regex;
use std::sync::LazyLock;

use crate::types::{DetectionSource, EntityType, PiiSpan};

const URL_SCORE: f64 = 0.85;
const PATH_SCORE: f64 = 0.85;

static URL_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\b(?:[a-z][a-z0-9+\-]{1,15}://|www\.)[^\s<>"'`{}|\\^\[\]]+"#).unwrap()
});

/// Absolute POSIX paths with at least two segments, or any path under `~`.
static UNIX_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?:~|\$HOME)(?:/[\w.@%+\-~]+)+/?|(?:/[\w.@%+\-~]+){2,}/?").unwrap()
});

/// Drive-letter paths. Directory names may contain single spaces
/// (`C:\Users\Anna Kovacs\Documents`); the last segment may not, so the
/// match stops before the surrounding sentence.
static WINDOWS_PATH_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r#"\b[A-Za-z]:[\\/]{1,2}"#,
        r#"(?:[^\\/:*?"<>|\s]+(?: [^\\/:*?"<>|\s]+)*[\\/]{1,2})*"#,
        r#"[^\\/:*?"<>|\s]*"#,
    ))
    .unwrap()
});

/// UNC shares (`\\fileserver\hr\salaries.xlsx`).
static UNC_PATH_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\\\\[\w.\-$]+(?:\\[^\\/:*?"<>|\s]+)+"#).unwrap());

static TOKEN_RUN_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"[A-Za-z0-9_\-]+").unwrap());

static UUID_RE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}").unwrap()
});

static EMAIL_LIKE_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}").unwrap());

static IPV4_RE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\d{1,3}(?:\.\d{1,3}){3}$").unwrap());

/// Top-level labels that only resolve inside a private network.
const PRIVATE_SUFFIXES: &[&str] = &[
    "internal",
    "intranet",
    "intra",
    "corp",
    "local",
    "lan",
    "localdomain",
    "home",
    "private",
];

/// SaaS hosts where the subdomain names the customer (`acme.sharepoint.com`).
const TENANT_DOMAINS: &[&str] = &[
    "sharepoint.com",
    "atlassian.net",
    "slack.com",
    "zendesk.com",
    "my.salesforce.com",
    "lightning.force.com",
    "service-now.com",
    "okta.com",
    "webex.com",
    "zoom.us",
    "freshdesk.com",
    "notion.site",
    "myworkday.com",
    "bamboohr.com",
    "gitlab.io",
];

/// Hosts where any path past the root opens a private document or meeting.
const PRIVATE_DOCUMENT_DOMAINS: &[&str] = &[
    "docs.google.com",
    "drive.google.com",
    "meet.google.com",
    "forms.gle",
    "dropbox.com",
    "1drv.ms",
    "onedrive.live.com",
    "notion.so",
    "figma.com",
    "box.com",
    "wetransfer.com",
    "we.tl",
    "teams.microsoft.com",
    "teams.live.com",
    "zoom.us",
    "calendly.com",
    "trello.com",
    "miro.com",
    "airtable.com",
];

/// Social networks where the first path segment is a person's handle.
const PROFILE_DOMAINS: &[&str] = &[
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "threads.net",
    "t.me",
    "wa.me",
];

/// Sites whose links are safe to pass on: documentation, code hosting,
/// package registries, reference works and large platforms, plus public
/// institutions. Every other host is assumed to belong to an organisation
/// and its links are replaced. Users extend this with `public_domains`.
const KNOWN_PUBLIC_DOMAINS: &[&str] = &[
    "wikipedia.org",
    "wikimedia.org",
    "wiktionary.org",
    "wikidata.org",
    "github.com",
    "githubusercontent.com",
    "gitlab.com",
    "bitbucket.org",
    "stackoverflow.com",
    "stackexchange.com",
    "superuser.com",
    "serverfault.com",
    "askubuntu.com",
    "mozilla.org",
    "python.org",
    "pypi.org",
    "npmjs.com",
    "crates.io",
    "docs.rs",
    "rust-lang.org",
    "go.dev",
    "golang.org",
    "nodejs.org",
    "microsoft.com",
    "apple.com",
    "google.com",
    "youtube.com",
    "youtu.be",
    "w3.org",
    "w3schools.com",
    "readthedocs.io",
    "readthedocs.org",
    "arxiv.org",
    "doi.org",
    "ietf.org",
    "rfc-editor.org",
    "kernel.org",
    "debian.org",
    "ubuntu.com",
    "archlinux.org",
    "docker.com",
    "kubernetes.io",
    "amazon.com",
    "cloudflare.com",
    "jsdelivr.net",
    "unpkg.com",
    "apache.org",
    "gnu.org",
    "oracle.com",
    "jetbrains.com",
    "visualstudio.com",
    "typescriptlang.org",
    "react.dev",
    "reactjs.org",
    "vuejs.org",
    "angular.dev",
    "angular.io",
    "svelte.dev",
    "nextjs.org",
    "php.net",
    "cppreference.com",
    "nuget.org",
    "rubygems.org",
    "mvnrepository.com",
    "openai.com",
    "anthropic.com",
    "reddit.com",
    "medium.com",
    "dev.to",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "example.com",
    "example.org",
    "example.net",
    "localhost",
    "gov",
    "gov.uk",
    "gov.hu",
    "europa.eu",
    "int",
];

/// First path segments on profile hosts that are site pages, not handles.
const PROFILE_SITE_PAGES: &[&str] = &[
    "home",
    "explore",
    "search",
    "help",
    "about",
    "login",
    "signup",
    "settings",
    "hashtag",
    "i",
    "intent",
    "share",
    "sharer",
    "sharer.php",
    "policies",
    "legal",
    "privacy",
    "terms",
    "tos",
    "watch",
    "groups",
    "events",
    "pages",
    "marketplace",
    "reel",
    "reels",
    "p",
    "tv",
];

/// Query keys whose value is a credential or identifies a person.
const SENSITIVE_QUERY_KEYS: &[&str] = &[
    "key", "sig", "sid", "code", "user", "username", "uid", "userid", "user_id", "account",
    "phone", "pwd", "pass", "ssn", "otp", "state",
];

/// Substrings that make any query key sensitive (`access_token`, `X-Amz-Signature`).
const SENSITIVE_QUERY_KEY_PARTS: &[&str] = &[
    "token",
    "secret",
    "signature",
    "password",
    "passwd",
    "session",
    "auth",
    "apikey",
    "api_key",
    "credential",
    "email",
];

/// Directory names under a home root that are not a person's account.
const SHARED_HOME_DIRS: &[&str] = &[
    "shared",
    "public",
    "default",
    "guest",
    "user",
    "username",
    "all users",
    "default user",
];

/// Run the link and path recognizers against the input text.
pub fn detect_links_and_paths(text: &str, public_domains: &[String]) -> Vec<PiiSpan> {
    let mut spans = Vec::new();
    let mut urls: Vec<(usize, usize)> = Vec::new();

    for mat in URL_RE.find_iter(text) {
        let end = mat.start() + trim_trailing_punctuation(mat.as_str()).len();
        urls.push((mat.start(), end));
        if is_sensitive_url(&text[mat.start()..end], public_domains) {
            spans.push(span(mat.start(), end, text, EntityType::Url, URL_SCORE));
        }
    }

    let paths = UNC_PATH_RE
        .find_iter(text)
        .chain(WINDOWS_PATH_RE.find_iter(text))
        .chain(UNIX_PATH_RE.find_iter(text));
    for mat in paths {
        let end = mat.start() + trim_trailing_punctuation(mat.as_str()).len();
        let inside_url = urls.iter().any(|&(s, e)| mat.start() < e && s < end);
        let claimed = spans.iter().any(|s| mat.start() < s.end && s.start < end);
        if inside_url
            || claimed
            || !starts_a_filesystem_path(text, mat.start())
            || !is_sensitive_path(&text[mat.start()..end])
        {
            continue;
        }
        spans.push(span(
            mat.start(),
            end,
            text,
            EntityType::FilePath,
            PATH_SCORE,
        ));
    }

    spans
}

/// Fold link and path spans into the regex spans. A sensitive link or path
/// replaces everything inside it (the email in a profile URL, the IP address
/// as host, the account name in a home path), so the whole reference can be
/// swapped for a coherent stand-in.
pub fn combine_with_regex(regex_spans: Vec<PiiSpan>, link_spans: Vec<PiiSpan>) -> Vec<PiiSpan> {
    let mut combined: Vec<PiiSpan> = regex_spans
        .into_iter()
        .filter(|span| !link_spans.iter().any(|link| link.overlaps(span)))
        .collect();
    combined.extend(link_spans);
    combined
}

/// `/home/…` inside a URL (`https://site.com/home/about`) is a web route, not
/// a filesystem path. Accept the match only at a token boundary or after
/// `file://`.
pub fn starts_a_filesystem_path(text: &str, start: usize) -> bool {
    let before = &text[..start];
    if before.ends_with("file://") {
        return true;
    }
    match before.chars().next_back() {
        None => true,
        Some(c) => c.is_whitespace() || "\"'`=([{,:;>~".contains(c),
    }
}

/// Whether a link (with or without scheme) should be replaced: it points at
/// something private, carries an identifier, or belongs to a host that is
/// neither built-in public nor listed in `public_domains`.
pub fn is_sensitive_url(url: &str, public_domains: &[String]) -> bool {
    let parts = UrlParts::parse(url);

    if parts.scheme.eq_ignore_ascii_case("file") {
        return is_sensitive_path(parts.path.trim_start_matches('/'))
            || is_sensitive_path(parts.path);
    }
    if parts.userinfo.is_some() {
        return true;
    }

    let host = parts.host.to_ascii_lowercase();
    if host.is_empty() {
        return false;
    }
    if IPV4_RE.is_match(&host) || is_private_host(&host) {
        return true;
    }

    let segments: Vec<&str> = parts.path.split('/').filter(|s| !s.is_empty()).collect();
    if TENANT_DOMAINS
        .iter()
        .any(|d| host.ends_with(&format!(".{d}")) && !host.starts_with("www."))
    {
        return true;
    }
    if !segments.is_empty()
        && PRIVATE_DOCUMENT_DOMAINS
            .iter()
            .any(|d| host_matches(&host, d))
    {
        return true;
    }
    if is_profile_link(&host, &segments) {
        return true;
    }

    segments
        .iter()
        .any(|segment| segment.starts_with('@') || carries_identifier(segment))
        || query_is_sensitive(parts.query)
        || query_is_sensitive(parts.fragment)
        || !is_public_host(&host, public_domains)
}

fn is_public_host(host: &str, public_domains: &[String]) -> bool {
    KNOWN_PUBLIC_DOMAINS.iter().any(|d| host_matches(host, d))
        || public_domains.iter().any(|d| {
            host_matches(
                host,
                d.trim()
                    .trim_start_matches("www.")
                    .to_ascii_lowercase()
                    .as_str(),
            )
        })
}

struct UrlParts<'a> {
    scheme: &'a str,
    userinfo: Option<&'a str>,
    host: &'a str,
    path: &'a str,
    query: &'a str,
    fragment: &'a str,
}

impl<'a> UrlParts<'a> {
    fn parse(url: &'a str) -> Self {
        let (scheme, rest) = match url.find("://") {
            Some(i) => (&url[..i], &url[i + 3..]),
            None => ("", url),
        };
        let (rest, fragment) = rest.split_once('#').unwrap_or((rest, ""));
        let (rest, query) = rest.split_once('?').unwrap_or((rest, ""));
        let (authority, path) = match rest.find('/') {
            Some(i) => (&rest[..i], &rest[i..]),
            None => (rest, ""),
        };
        let (userinfo, host_port) = match authority.rfind('@') {
            Some(i) => (Some(&authority[..i]), &authority[i + 1..]),
            None => (None, authority),
        };
        let host = host_port.split(':').next().unwrap_or("");
        Self {
            scheme,
            userinfo,
            host,
            path,
            query,
            fragment,
        }
    }
}

fn host_matches(host: &str, domain: &str) -> bool {
    host == domain || host.ends_with(&format!(".{domain}"))
}

/// Single-label hosts (`http://jenkins:8080`) and private-network suffixes.
fn is_private_host(host: &str) -> bool {
    if host == "localhost" || host.ends_with(".localhost") {
        return false;
    }
    match host.rsplit('.').next() {
        _ if !host.contains('.') => true,
        Some(tld) => PRIVATE_SUFFIXES.contains(&tld),
        None => false,
    }
}

fn is_profile_link(host: &str, segments: &[&str]) -> bool {
    if host_matches(host, "linkedin.com") {
        // People (`in`, `pub`) and organisations (`company`, `school`, `showcase`).
        return matches!(
            segments.first(),
            Some(&"in" | &"pub" | &"company" | &"school" | &"showcase")
        ) && segments.len() > 1;
    }
    PROFILE_DOMAINS.iter().any(|d| host_matches(host, d))
        && segments
            .first()
            .is_some_and(|first| !PROFILE_SITE_PAGES.contains(&first.to_ascii_lowercase().as_str()))
}

fn query_is_sensitive(query: &str) -> bool {
    query.split(['&', ';']).any(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or(("", pair));
        if value.is_empty() {
            return false;
        }
        let key = key.to_ascii_lowercase();
        SENSITIVE_QUERY_KEYS.contains(&key.as_str())
            || SENSITIVE_QUERY_KEY_PARTS
                .iter()
                .any(|part| key.contains(part))
            || carries_identifier(value)
    })
}

/// An email, UUID, long hex digest, long number or high-entropy token.
fn carries_identifier(segment: &str) -> bool {
    let decoded = segment.replace("%40", "@");
    if EMAIL_LIKE_RE.is_match(&decoded) || UUID_RE.is_match(segment) {
        return true;
    }
    TOKEN_RUN_RE
        .find_iter(segment)
        .any(|run| is_identifier_token(run.as_str()))
}

fn is_identifier_token(token: &str) -> bool {
    let digits = token.chars().filter(char::is_ascii_digit).count();
    let upper = token.chars().filter(char::is_ascii_uppercase).count();
    let lower = token.chars().filter(char::is_ascii_lowercase).count();
    let len = token.len();

    let hex_digest = len >= 32 && token.chars().all(|c| c.is_ascii_hexdigit());
    let long_number = digits == len && len >= 9;
    let mixed_token = len >= 20 && digits > 0 && upper > 0 && lower > 0;
    let lower_token = len >= 24 && digits >= 4 && !token.contains('-');
    hex_digest || long_number || mixed_token || lower_token
}

/// Whether a filesystem path names an account, a network share or an identifier.
fn is_sensitive_path(path: &str) -> bool {
    if path.starts_with("\\\\") {
        return true;
    }
    let segments: Vec<&str> = path
        .split(['/', '\\'])
        .filter(|s| !s.is_empty() && !s.ends_with(':'))
        .collect();
    let lower: Vec<String> = segments.iter().map(|s| s.to_ascii_lowercase()).collect();

    let account_at = match lower.first().map(String::as_str) {
        Some("home" | "users") => Some(1),
        Some("media") => Some(1),
        Some("run") if lower.get(1).is_some_and(|s| s == "media") => Some(2),
        // WSL mounts: /mnt/c/Users/<account>
        Some("mnt") if lower.get(2).is_some_and(|s| s == "users") => Some(3),
        _ => None,
    };
    if let Some(account) = account_at.and_then(|i| lower.get(i)) {
        if !SHARED_HOME_DIRS.contains(&account.as_str()) {
            return true;
        }
    }

    segments.iter().any(|segment| carries_identifier(segment))
}

/// Drop sentence punctuation (and an unbalanced closing bracket, as in a
/// Markdown link) from the end of a match.
fn trim_trailing_punctuation(mut s: &str) -> &str {
    loop {
        let Some(last) = s.chars().next_back() else {
            return s;
        };
        let unbalanced = match last {
            ')' => s.matches('(').count() < s.matches(')').count(),
            _ => false,
        };
        if ".,;:!?'\"*".contains(last) || unbalanced {
            s = &s[..s.len() - last.len_utf8()];
        } else {
            return s;
        }
    }
}

fn span(start: usize, end: usize, text: &str, entity_type: EntityType, score: f64) -> PiiSpan {
    PiiSpan::new(
        start,
        end,
        entity_type,
        score,
        text[start..end].to_string(),
        DetectionSource::Regex,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found(text: &str, entity_type: EntityType) -> Vec<String> {
        detect_links_and_paths(text, &[])
            .into_iter()
            .filter(|s| s.entity_type == entity_type)
            .map(|s| s.text)
            .collect()
    }

    fn urls(text: &str) -> Vec<String> {
        found(text, EntityType::Url)
    }

    fn paths(text: &str) -> Vec<String> {
        found(text, EntityType::FilePath)
    }

    #[test]
    fn leaves_public_links_alone() {
        assert!(urls("See https://docs.python.org/3/library/re.html for details.").is_empty());
        assert!(urls("https://github.com/rust-lang/regex/issues/42").is_empty());
        assert!(urls("https://en.wikipedia.org/wiki/Personal_data").is_empty());
        assert!(urls("https://www.youtube.com/watch?v=dQw4w9WgXcQ").is_empty());
        assert!(urls("http://localhost:3000/api/health").is_empty());
        assert!(urls("https://x.com/explore").is_empty());
        assert!(urls("https://data.gov.hu/dataset/budget").is_empty());
        assert!(urls("https://learn.microsoft.com/en-us/dotnet/").is_empty());
    }

    #[test]
    fn detects_organisation_websites() {
        assert_eq!(
            urls("See https://www.acme.hu/rolunk."),
            vec!["https://www.acme.hu/rolunk"]
        );
        assert_eq!(urls("http://acme-group.com"), vec!["http://acme-group.com"]);
        assert_eq!(urls("www.acme.hu/kapcsolat"), vec!["www.acme.hu/kapcsolat"]);
        assert_eq!(
            urls("https://www.linkedin.com/company/acme-kft/"),
            vec!["https://www.linkedin.com/company/acme-kft/"]
        );
    }

    #[test]
    fn user_public_domains_are_left_alone_unless_the_link_is_private() {
        let public = vec!["acme.hu".to_string(), "www.partner.com".to_string()];
        let found = |text: &str| -> Vec<String> {
            detect_links_and_paths(text, &public)
                .into_iter()
                .map(|s| s.text)
                .collect()
        };
        assert!(found("https://www.acme.hu/rolunk").is_empty());
        assert!(found("https://shop.partner.com/").is_empty());
        assert_eq!(
            found("https://www.acme.hu/login?token=abc123"),
            vec!["https://www.acme.hu/login?token=abc123"]
        );
    }

    #[test]
    fn detects_internal_hosts() {
        assert_eq!(
            urls("open https://jira.acme.corp/browse/PAY-1234."),
            vec!["https://jira.acme.corp/browse/PAY-1234"]
        );
        assert_eq!(
            urls("http://jenkins:8080/job/deploy"),
            vec!["http://jenkins:8080/job/deploy"]
        );
        assert_eq!(
            urls("http://10.0.0.12/admin"),
            vec!["http://10.0.0.12/admin"]
        );
    }

    #[test]
    fn detects_credentials_and_tokens() {
        assert_eq!(
            urls("DATABASE_URL=postgres://admin:s3cretPw@db.acme.com:5432/app"),
            vec!["postgres://admin:s3cretPw@db.acme.com:5432/app"]
        );
        assert_eq!(
            urls("https://api.example.com/v1/items?access_token=abc123"),
            vec!["https://api.example.com/v1/items?access_token=abc123"]
        );
        assert_eq!(
            urls("https://shop.example.com/orders/7f3c2a1e-9b4d-4c3e-8a2f-1d2e3f4a5b6c"),
            vec!["https://shop.example.com/orders/7f3c2a1e-9b4d-4c3e-8a2f-1d2e3f4a5b6c"]
        );
        assert_eq!(
            urls("https://crm.example.com/contacts/anna.kovacs%40acme.hu"),
            vec!["https://crm.example.com/contacts/anna.kovacs%40acme.hu"]
        );
    }

    #[test]
    fn detects_private_documents_tenants_and_profiles() {
        let doc =
            "https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit";
        assert_eq!(urls(doc), vec![doc]);
        assert_eq!(
            urls("https://acme.sharepoint.com/sites/HR"),
            vec!["https://acme.sharepoint.com/sites/HR"]
        );
        assert_eq!(
            urls("https://www.linkedin.com/in/anna-kovacs-123/"),
            vec!["https://www.linkedin.com/in/anna-kovacs-123/"]
        );
        assert_eq!(
            urls("https://medium.com/@annak/post"),
            vec!["https://medium.com/@annak/post"]
        );
        assert!(urls("https://www.linkedin.com/company/").is_empty());
    }

    #[test]
    fn trims_sentence_and_markdown_punctuation() {
        assert_eq!(
            urls("[board](https://acme.atlassian.net/jira/boards/7)."),
            vec!["https://acme.atlassian.net/jira/boards/7"]
        );
        assert_eq!(
            urls("(see https://wiki.acme.internal/Page_(draft))"),
            vec!["https://wiki.acme.internal/Page_(draft)"]
        );
    }

    #[test]
    fn detects_home_directory_paths() {
        assert_eq!(
            paths("File \"/Users/jdoe/project/app.py\", line 3"),
            vec!["/Users/jdoe/project/app.py"]
        );
        assert_eq!(paths("cd /home/anna.k/src"), vec!["/home/anna.k/src"]);
        assert_eq!(
            paths(r#"path = "C:\\Users\\mmueller\\AppData""#),
            vec![r#"C:\\Users\\mmueller\\AppData"#]
        );
        assert_eq!(
            paths(r"Saved to C:\Users\Anna Kovacs\Documents\report.xlsx today"),
            vec![r"C:\Users\Anna Kovacs\Documents\report.xlsx"]
        );
        assert_eq!(
            paths("ls /mnt/c/Users/bob/Desktop"),
            vec!["/mnt/c/Users/bob/Desktop"]
        );
    }

    #[test]
    fn detects_network_shares_and_identifier_paths() {
        assert_eq!(
            paths(r"copy \\fileserver\hr\salaries.xlsx now"),
            vec![r"\\fileserver\hr\salaries.xlsx"]
        );
        assert_eq!(
            paths("/var/data/exports/7f3c2a1e-9b4d-4c3e-8a2f-1d2e3f4a5b6c.csv"),
            vec!["/var/data/exports/7f3c2a1e-9b4d-4c3e-8a2f-1d2e3f4a5b6c.csv"]
        );
    }

    #[test]
    fn leaves_system_paths_alone() {
        assert!(paths("run /usr/local/bin/node").is_empty());
        assert!(paths("edit /etc/hosts").is_empty());
        assert!(paths(r"C:\Windows\System32\drivers").is_empty());
        assert!(paths("ls /Users/Shared/data").is_empty());
        assert!(paths("~/projects/app/src").is_empty());
        assert!(paths("and/or 12/05/2023").is_empty());
    }

    #[test]
    fn web_routes_are_not_paths() {
        assert!(paths("https://example.com/home/about").is_empty());
        assert!(found("https://example.com/home/about", EntityType::Url).is_empty());
    }

    #[test]
    fn file_urls_use_path_rules() {
        assert_eq!(
            urls("file:///C:/Users/mmueller/notes.txt"),
            vec!["file:///C:/Users/mmueller/notes.txt"]
        );
        assert!(urls("file:///usr/share/doc/index.html").is_empty());
    }

    #[test]
    fn link_spans_replace_what_they_contain() {
        let text = "https://crm.example.com/u/anna@acme.hu 10.0.0.1";
        let inner = vec![
            span(29, 38, text, EntityType::Email, 0.9),
            span(39, 47, text, EntityType::IpAddress, 0.9),
        ];
        let combined = combine_with_regex(inner, detect_links_and_paths(text, &[]));
        let types: Vec<EntityType> = combined.iter().map(|s| s.entity_type).collect();
        assert_eq!(types, vec![EntityType::IpAddress, EntityType::Url]);
    }
}
