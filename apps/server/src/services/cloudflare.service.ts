import { Env } from '../bindings';
import { UsageStats } from '@luminatick/shared';
import { decryptString } from '../utils/crypto';

export class CloudflareService {
  constructor(private env: Env) {}

  async getCredentials(): Promise<{ accountId: string, apiToken: string }> {
    let accountId = this.env.CLOUDFLARE_ACCOUNT_ID;
    let apiToken = this.env.CLOUDFLARE_API_TOKEN;

    if (!accountId || !apiToken) {
      const { results } = await this.env.DB.prepare(
        "SELECT key, value FROM config WHERE key IN ('CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN')"
      ).all<{ key: string, value: string }>();

      const dbConfig = results.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
      }, {} as Record<string, string>);

      accountId = accountId || dbConfig['CLOUDFLARE_ACCOUNT_ID'];
      
      if (!apiToken && dbConfig['CLOUDFLARE_API_TOKEN']) {
        if (!this.env.APP_MASTER_KEY) {
          throw new Error('APP_MASTER_KEY is missing. Cannot decrypt CLOUDFLARE_API_TOKEN.');
        }
        try {
          apiToken = await decryptString(dbConfig['CLOUDFLARE_API_TOKEN'], this.env.APP_MASTER_KEY);
        } catch (error) {
          throw new Error('Failed to decrypt CLOUDFLARE_API_TOKEN. ' + (error instanceof Error ? error.message : String(error)));
        }
      }
    }

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare credentials not configured');
    }

    return { accountId, apiToken };
  }

  async getUsageStats(): Promise<UsageStats> {
    const { accountId, apiToken } = await this.getCredentials();

    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    
    const startOfMonthStr = startOfMonth.toISOString();
    const startOfDayStr = startOfDay.toISOString();
    const end = now.toISOString();

    const query = `
      query getUsage($accountId: string, $startOfMonth: string, $startOfDay: string, $end: string) {
        viewer {
          accounts(filter: { accountTag: $accountId }) {
            d1AnalyticsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
              sum {
                readQueries
                writeQueries
                rowsRead
                rowsWritten
              }
            }
            r2OperationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfMonth, datetime_leq: $end }) {
              dimensions {
                actionType
              }
              sum {
                requests
              }
            }
            durableObjectsInvocationsAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
              sum {
                requests
              }
            }
            durableObjectsPeriodicGroups(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
              max {
                activeWebsocketConnections
              }
            }
            aiInferenceAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
              sum {
                totalNeurons
              }
            }
            workersInvocationsAdaptive(limit: 10000, filter: { datetime_geq: $startOfDay, datetime_leq: $end }) {
              sum {
                requests
                cpuTimeUs
              }
            }
            vectorizeV2QueriesAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfMonth, datetime_leq: $end }) {
              sum {
                servedVectorCount
              }
            }
            vectorizeV2WritesAdaptiveGroups(limit: 10000, filter: { datetime_geq: $startOfMonth, datetime_leq: $end }) {
              sum {
                addedVectorCount
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          accountId: accountId,
          startOfMonth: startOfMonthStr,
          startOfDay: startOfDayStr,
          end,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('GraphQL Analytics Error:', text);
      throw new Error(`Failed to fetch usage stats: ${response.statusText}`);
    }

    const json: any = await response.json();
    if (json.errors) {
      console.error('GraphQL Analytics Errors:', json.errors);
      throw new Error('GraphQL query returned errors');
    }

    const account = json.data?.viewer?.accounts?.[0];
    if (!account) {
      throw new Error('No account data returned');
    }

    const d1Groups = account.d1AnalyticsAdaptiveGroups || [];
    const d1Sum = d1Groups.reduce((acc: any, g: any) => ({
      readQueries: acc.readQueries + (g.sum?.readQueries || 0),
      writeQueries: acc.writeQueries + (g.sum?.writeQueries || 0),
      rowsRead: acc.rowsRead + (g.sum?.rowsRead || 0),
      rowsWritten: acc.rowsWritten + (g.sum?.rowsWritten || 0),
    }), { readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0 });

    const r2Groups = account.r2OperationsAdaptiveGroups || [];
    const r2Sum = r2Groups.reduce((acc: any, g: any) => {
      const action = g.dimensions?.actionType || '';
      const reqs = g.sum?.requests || 0;
      if (['PutObject', 'CopyObject', 'ListObjects', 'ListBuckets', 'CreateMultipartUpload', 'CompleteMultipartUpload', 'UploadPart'].includes(action)) {
        acc.classAOperations += reqs;
      } else if (['GetObject', 'HeadObject', 'UsageSummary'].includes(action)) {
        acc.classBOperations += reqs;
      }
      return acc;
    }, { classAOperations: 0, classBOperations: 0 });

    const aiGroups = account.aiInferenceAdaptiveGroups || [];    const aiSum = aiGroups.reduce((acc: any, g: any) => ({
      neurons: acc.neurons + (g.sum?.totalNeurons || 0)
    }), { neurons: 0 });

    const workersItems = account.workersInvocationsAdaptive || [];
    const workersSum = workersItems.reduce((acc: any, g: any) => ({
      requests: acc.requests + (g.sum?.requests || 0),
      cpuTime: acc.cpuTime + (g.sum?.cpuTimeUs || 0)
    }), { requests: 0, cpuTime: 0 });

    const doInvocations = account.durableObjectsInvocationsAdaptiveGroups || [];
    const doInvocationsSum = doInvocations.reduce((acc: any, g: any) => ({
      requests: acc.requests + (g.sum?.requests || 0),
      cpuTime: acc.cpuTime + (g.sum?.cpuTime || 0)
    }), { requests: 0, cpuTime: 0 });

    const doPeriodic = account.durableObjectsPeriodicGroups || [];
    const doPeriodicSum = doPeriodic.reduce((acc: any, g: any) => ({
      activeConnections: Math.max(acc.activeConnections, g.max?.activeWebsocketConnections || 0)
    }), { activeConnections: 0 });

    const vectorizeQueries = account.vectorizeV2QueriesAdaptiveGroups || [];
    const vectorizeQueriesSum = vectorizeQueries.reduce((acc: any, g: any) => ({
      queried: acc.queried + (g.sum?.servedVectorCount || 0)
    }), { queried: 0 });

    const vectorizeWrites = account.vectorizeV2WritesAdaptiveGroups || [];
    const vectorizeWritesSum = vectorizeWrites.reduce((acc: any, g: any) => ({
      written: acc.written + (g.sum?.addedVectorCount || 0)
    }), { written: 0 });

    return {
      d1: {
        readQueries: d1Sum.readQueries || 0,
        writeQueries: d1Sum.writeQueries || 0,
        rowsRead: d1Sum.rowsRead || 0,
        rowsWritten: d1Sum.rowsWritten || 0,
      },
      r2: {
        classAOperations: r2Sum.classAOperations || 0,
        classBOperations: r2Sum.classBOperations || 0,
      },
      workersAi: {
        neurons: aiSum.neurons || 0,
      },
      workers: {
        requests: workersSum.requests || 0,
        cpuTime: workersSum.cpuTime || 0,
      },
      durableObjects: {
        requests: doInvocationsSum.requests || 0,
        cpuTime: doInvocationsSum.cpuTime || 0,
        activeConnections: doPeriodicSum.activeConnections || 0,
        inboundWebsocketMsg: 0,
        outboundWebsocketMsg: 0,
      },
      vectorize: {
        queried: vectorizeQueriesSum.queried || 0,
        written: vectorizeWritesSum.written || 0,
      },
      period: {
        start: startOfMonthStr,
        end,
      },
    };
  }
}
