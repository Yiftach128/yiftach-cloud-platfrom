/**
 * Maps the daemon's raw stats sample (GET /containers/{id}/stats) onto the
 * platform's `ContainerStats`. The raw shapes live here, next to the mapping,
 * like in `container-mapper.ts`, so `interfaces.ts` never depends on the wire
 * format. The CPU and memory arithmetic mirrors what the `docker stats` CLI
 * computes from the same sample.
 */

import type { ContainerStats } from './interfaces.ts';

export interface RawCpuUsage {
    total_usage?: number;
    /** Reported by cgroup v1 daemons; the fallback core count when online_cpus is absent. */
    percpu_usage?: number[] | null;
}

export interface RawCpuStats {
    cpu_usage?: RawCpuUsage;
    system_cpu_usage?: number;
    online_cpus?: number;
}

export interface RawMemoryStats {
    usage?: number;
    limit?: number;
    stats?: {
        /** Page cache under cgroup v2. */
        inactive_file?: number;
        /** Page cache under cgroup v1. */
        total_inactive_file?: number;
    };
}

/**
 * Defensive view of dockerode's `ContainerStats`: dockerode declares the
 * sections required, but the daemon omits whole subtrees — a container that
 * stopped just before sampling reports `memory_stats: {}`, and a sample taken
 * without a predecessor has no `system_cpu_usage` in `precpu_stats`.
 */
export interface RawContainerStats {
    cpu_stats?: RawCpuStats;
    precpu_stats?: RawCpuStats;
    memory_stats?: RawMemoryStats;
}

/**
 * One usable sample, or null when the daemon returned an empty shell (the
 * container stopped between being listed and being sampled).
 */
export function toContainerStats(raw: RawContainerStats): ContainerStats | null {
    if (raw.memory_stats === undefined || raw.memory_stats.usage === undefined) {
        return null;
    }

    return {
        cpuPercent: computeCpuPercent(raw.cpu_stats, raw.precpu_stats),
        memoryUsedBytes: computeMemoryUsed(raw.memory_stats),
        memoryLimitBytes: orZero(raw.memory_stats.limit),
    };
}

/** `docker stats`'s formula: the container's share of the host CPU time elapsed, times cores, times 100. */
function computeCpuPercent(cpu: RawCpuStats | undefined, precpu: RawCpuStats | undefined): number {
    const cpuDelta = readTotalUsage(cpu) - readTotalUsage(precpu);
    const systemDelta = readSystemUsage(cpu) - readSystemUsage(precpu);
    if (cpuDelta <= 0 || systemDelta <= 0) {
        return 0;
    }
    return (cpuDelta / systemDelta) * readOnlineCpus(cpu) * 100;
}

/**
 * Usage minus the reclaimable page cache — the daemon counts file cache into
 * `usage`, which would make an I/O-heavy container look like a memory leak.
 */
function computeMemoryUsed(memory: RawMemoryStats): number {
    const usage = orZero(memory.usage);

    let pageCache: number;
    if (memory.stats === undefined) {
        pageCache = 0;
    } else if (memory.stats.inactive_file !== undefined) {
        pageCache = memory.stats.inactive_file;
    } else if (memory.stats.total_inactive_file !== undefined) {
        pageCache = memory.stats.total_inactive_file;
    } else {
        pageCache = 0;
    }

    if (pageCache >= usage) {
        return usage;
    }
    return usage - pageCache;
}

function readTotalUsage(stats: RawCpuStats | undefined): number {
    if (stats === undefined || stats.cpu_usage === undefined) {
        return 0;
    }
    return orZero(stats.cpu_usage.total_usage);
}

function readSystemUsage(stats: RawCpuStats | undefined): number {
    if (stats === undefined) {
        return 0;
    }
    return orZero(stats.system_cpu_usage);
}

function readOnlineCpus(stats: RawCpuStats | undefined): number {
    if (stats === undefined) {
        return 1;
    }
    if (stats.online_cpus !== undefined && stats.online_cpus > 0) {
        return stats.online_cpus;
    }
    const perCpu = stats.cpu_usage;
    if (perCpu !== undefined && perCpu.percpu_usage !== undefined && perCpu.percpu_usage !== null && perCpu.percpu_usage.length > 0) {
        return perCpu.percpu_usage.length;
    }
    return 1;
}

/** Explicit defaulting for optional wire numbers, like container-mapper's orDefault. */
function orZero(value: number | undefined): number {
    if (value === undefined) {
        return 0;
    }
    return value;
}
