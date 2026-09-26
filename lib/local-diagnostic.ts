import { ORIGIN } from './experiment';

// Describe the existing downloadable fixture without running a client or creating a run.
export function localCurlDiagnostic() {
  return {
    kind: 'local-curl-retry-after-diagnostic',
    source_url: ORIGIN + '/retry-local.py',
    guide_url: ORIGIN + '/guides/curl-retry-after',
    requirements: ['Python 3.9+', 'curl on PATH', 'permission to open a loopback listener'],
    commands: {
      download: `curl -fsS ${ORIGIN}/retry-local.py -o retry-local.py`,
      test_429: 'python3 retry-local.py > retry-local-report.json',
      test_503: 'python3 retry-local.py --status 503 > retry-local-503.json',
    },
    checks: [
      'Default curl and --retry 1, each against a fresh response sequence',
      'Retry-After as seconds and as an HTTP-date',
      'Installed curl version, final HTTP status, observed attempts, arrival gaps and wall time',
    ],
    execution: {
      performed_by_this_call: false,
      runtime_network: '127.0.0.1 only; downloading the source is a separate external request',
      account_required: false,
      uploads_results: false,
      publishes_results: false,
    },
    limits: [
      'Review the source before choosing to execute it.',
      'Tests installed curl, not an application retry wrapper.',
      'Local self-run observations are not independent remote evidence.',
      'A final 200 does not establish that retrying an arbitrary operation is safe.',
    ],
    remote_option: {
      when_useful: 'When your task needs a separate server-observed trace or a stable, deliberately published reproduction reference.',
      protocol_url: ORIGIN + '/protocol',
      tool: 'create_retry_run',
      publication: 'Separate and optional; local reports are never uploaded by this diagnostic.',
    },
  };
}
