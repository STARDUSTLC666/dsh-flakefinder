/**
 * dsh-flakefinder 配置解析：重复次数、超时、审批策略与存储路径。
 *
 * @module dsh-flakefinder/config
 */
/** 插件行配置（cordis.patch.yml 里的 config 段，可缺省）。 */
export interface FlakeConfig {
    /** flaky_detect 默认重复次数（3-20）。 */
    defaultRuns?: number;
    /** 单次运行允许的最大重复次数（3-50，默认 20）。 */
    maxRuns?: number;
    /** 单次测试运行的超时（毫秒，默认 120000）。 */
    timeoutMs?: number;
    /** 超时后给测试进程的宽限时间（毫秒，默认 10000）。 */
    graceMs?: number;
    /** quarantine/clear 两个写工具是否走宿主审批门（默认 true）。 */
    writeApproval?: boolean;
    /** 历史存储目录（默认 DSH_HOME/.dsh-flakefinder）。 */
    dataDir?: string;
    /** 项目隔离清单路径（默认 cwd/.flakefinder.json）。 */
    quarantineFile?: string;
    /** Python 解释器命令（pytest 框架使用，默认 DSH_FLAKEFINDER_PYTHON 或 python/python3）。 */
    pythonPath?: string;
}
/** 解析后的配置。 */
export interface ResolvedFlakeConfig {
    defaultRuns: number;
    maxRuns: number;
    timeoutMs: number;
    graceMs: number;
    writeApproval: boolean;
    dataDir: string;
    quarantineFile: string;
    pythonPath: string;
}
/** 解析并校验配置，非法值抛出中文错误。 */
export declare function resolveConfig(config: FlakeConfig | undefined | null, cwd?: string): ResolvedFlakeConfig;
/** 解析并钳制 flaky_detect 的 runs 参数。 */
export declare function resolveRuns(raw: unknown, cfg: ResolvedFlakeConfig): number;
/** 校验测试目标：非空且不能以 - 开头，避免被测试框架解析成选项。 */
export declare function assertTarget(value: string): string;
/** 从参数里取字符串；不识别类型时返回 undefined。 */
export declare function optionalString(args: Record<string, unknown>, key: string): string | undefined;
/** 从参数里取必填字符串；缺失时抛中文错误。 */
export declare function requiredString(args: Record<string, unknown>, key: string, label: string): string;
/** 从参数里取整数；缺失用默认值，非法抛中文错误。 */
export declare function optionalInteger(args: Record<string, unknown>, key: string, label: string, lo: number, hi: number, fallback: number): number;
