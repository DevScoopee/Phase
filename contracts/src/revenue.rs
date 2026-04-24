use soroban_sdk::{contracttype, Address, Env, Vec};

// ── Types ─────────────────────────────────────────────────────────────────────

/// How revenue is spread across a subscription period.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum RecognitionMethod {
    /// Equal amount recognised each period (ASC 606 / IFRS 15 default).
    StraightLine,
    /// Recognised proportionally to actual usage reported by the merchant.
    UsageBased,
}

/// Configurable rule attached to a plan that governs how its revenue is recognised.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RevenueRecognitionRule {
    pub plan_id: u64,
    pub method: RecognitionMethod,
    /// Length of one recognition period in seconds (e.g. 2_592_000 = 30 days).
    pub recognition_period: u64,
}

/// A single entry in a revenue recognition schedule.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RevenueScheduleEntry {
    /// Unix timestamp when this slice of revenue starts being earned.
    pub period_start: u64,
    /// Unix timestamp when this slice of revenue finishes being earned.
    pub period_end: u64,
    /// Amount recognised (in stroops) during [period_start, period_end].
    pub recognised_amount: i128,
    /// Whether this entry has been fully recognised (period_end has passed).
    pub is_recognised: bool,
}

/// Full recognition schedule for one subscription charge.
#[contracttype]
#[derive(Clone, Debug)]
pub struct RevenueSchedule {
    pub subscription_id: u64,
    pub total_amount: i128,
    pub entries: Vec<RevenueScheduleEntry>,
}

/// Snapshot of recognised vs deferred revenue for a merchant.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Recognition {
    pub subscription_id: u64,
    pub merchant: Address,
    /// Revenue already earned (period elapsed).
    pub recognised_revenue: i128,
    /// Revenue received but not yet earned (future periods).
    pub deferred_revenue: i128,
    /// Timestamp of this snapshot.
    pub as_of: u64,
}

/// Per-period revenue analytics entry.
#[contracttype]
#[derive(Clone, Debug)]
pub struct PeriodRevenue {
    pub period_start: u64,
    pub period_end: u64,
    pub recognised_amount: i128,
    pub subscription_count: u32,
}

// ── Storage keys ──────────────────────────────────────────────────────────────

#[contracttype]
pub enum RevenueDataKey {
    /// RevenueRecognitionRule keyed by plan_id.
    RecognitionRule(u64),
    /// RevenueSchedule keyed by subscription_id.
    Schedule(u64),
    /// Cumulative deferred revenue balance for a merchant.
    DeferredRevenue(Address),
    /// Cumulative recognised revenue for a merchant.
    RecognisedRevenue(Address),
    /// List of subscription IDs tracked for a merchant (for analytics).
    MerchantSubscriptions(Address),
}

// ── Core logic (pure functions, no Env dependency) ────────────────────────────

/// Build a straight-line schedule: split `total_amount` evenly across
/// `num_periods` consecutive periods of `period_secs` seconds each,
/// starting at `charge_time`.
///
/// Any rounding remainder is added to the last entry.
pub fn build_straight_line_schedule(
    env: &Env,
    subscription_id: u64,
    total_amount: i128,
    charge_time: u64,
    period_secs: u64,
    num_periods: u32,
) -> RevenueSchedule {
    assert!(num_periods > 0, "num_periods must be > 0");
    assert!(period_secs > 0, "period_secs must be > 0");
    assert!(total_amount >= 0, "total_amount must be non-negative");

    let slice = total_amount / num_periods as i128;
    let remainder = total_amount - slice * num_periods as i128;

    let mut entries: Vec<RevenueScheduleEntry> = Vec::new(env);
    for i in 0..num_periods {
        let start = charge_time + (i as u64) * period_secs;
        let end = start + period_secs;
        let amount = if i == num_periods - 1 { slice + remainder } else { slice };
        entries.push_back(RevenueScheduleEntry {
            period_start: start,
            period_end: end,
            recognised_amount: amount,
            is_recognised: false,
        });
    }

    RevenueSchedule { subscription_id, total_amount, entries }
}

/// Build a usage-based schedule: a single entry covering the full interval.
/// The merchant reports actual usage later; until then the full amount is deferred.
pub fn build_usage_based_schedule(
    env: &Env,
    subscription_id: u64,
    total_amount: i128,
    charge_time: u64,
    interval_secs: u64,
) -> RevenueSchedule {
    let mut entries: Vec<RevenueScheduleEntry> = Vec::new(env);
    entries.push_back(RevenueScheduleEntry {
        period_start: charge_time,
        period_end: charge_time + interval_secs,
        recognised_amount: total_amount,
        is_recognised: false,
    });
    RevenueSchedule { subscription_id, total_amount, entries }
}

/// Walk a schedule and return (recognised, deferred) split as of `now`.
pub fn split_recognised_deferred(
    schedule: &RevenueSchedule,
    now: u64,
) -> (i128, i128) {
    let mut recognised: i128 = 0;
    let mut deferred: i128 = 0;
    for entry in schedule.entries.iter() {
        if now >= entry.period_end {
            recognised += entry.recognised_amount;
        } else if now >= entry.period_start {
            // Partial recognition: pro-rate within the current period.
            let elapsed = now - entry.period_start;
            let duration = entry.period_end - entry.period_start;
            let partial = entry.recognised_amount * elapsed as i128 / duration as i128;
            recognised += partial;
            deferred += entry.recognised_amount - partial;
        } else {
            deferred += entry.recognised_amount;
        }
    }
    (recognised, deferred)
}

// ── Contract-level helpers (require Env) ──────────────────────────────────────

/// Persist a recognition rule for a plan.
pub fn set_recognition_rule(env: &Env, rule: RevenueRecognitionRule) {
    env.storage()
        .persistent()
        .set(&RevenueDataKey::RecognitionRule(rule.plan_id), &rule);
}

/// Retrieve the recognition rule for a plan (returns None if not configured).
pub fn get_recognition_rule(env: &Env, plan_id: u64) -> Option<RevenueRecognitionRule> {
    env.storage()
        .persistent()
        .get(&RevenueDataKey::RecognitionRule(plan_id))
}

/// Generate and persist a revenue schedule for a subscription charge.
/// `interval_secs` is the plan's billing interval.
pub fn generate_revenue_schedule(
    env: &Env,
    subscription_id: u64,
    plan_id: u64,
    total_amount: i128,
    charge_time: u64,
    interval_secs: u64,
) -> RevenueSchedule {
    let rule = get_recognition_rule(env, plan_id);

    let schedule = match rule {
        Some(r) => {
            let num_periods = if r.recognition_period > 0 {
                ((interval_secs + r.recognition_period - 1) / r.recognition_period) as u32
            } else {
                1
            };
            match r.method {
                RecognitionMethod::StraightLine => build_straight_line_schedule(
                    env,
                    subscription_id,
                    total_amount,
                    charge_time,
                    r.recognition_period,
                    num_periods,
                ),
                RecognitionMethod::UsageBased => build_usage_based_schedule(
                    env,
                    subscription_id,
                    total_amount,
                    charge_time,
                    interval_secs,
                ),
            }
        }
        // Default: straight-line over the full interval as a single period.
        None => build_straight_line_schedule(
            env,
            subscription_id,
            total_amount,
            charge_time,
            interval_secs,
            1,
        ),
    };

    env.storage()
        .persistent()
        .set(&RevenueDataKey::Schedule(subscription_id), &schedule);

    schedule
}

/// Compute a Recognition snapshot for a subscription as of `now`.
/// Returns a zero-revenue snapshot if no schedule has been generated yet.
pub fn recognize_revenue(env: &Env, subscription_id: u64, merchant: Address, now: u64) -> Recognition {
    let maybe_schedule: Option<RevenueSchedule> = env
        .storage()
        .persistent()
        .get(&RevenueDataKey::Schedule(subscription_id));

    match maybe_schedule {
        None => Recognition {
            subscription_id,
            merchant,
            recognised_revenue: 0,
            deferred_revenue: 0,
            as_of: now,
        },
        Some(schedule) => {
            let (recognised, deferred) = split_recognised_deferred(&schedule, now);
            Recognition {
                subscription_id,
                merchant,
                recognised_revenue: recognised,
                deferred_revenue: deferred,
                as_of: now,
            }
        }
    }
}

/// Return the cumulative deferred revenue balance for a merchant.
pub fn get_deferred_revenue(env: &Env, merchant_id: Address) -> i128 {
    env.storage()
        .persistent()
        .get(&RevenueDataKey::DeferredRevenue(merchant_id))
        .unwrap_or(0i128)
}

/// Return the revenue schedule for a subscription (None if not yet generated).
pub fn get_revenue_schedule(env: &Env, subscription_id: u64) -> Option<RevenueSchedule> {
    env.storage()
        .persistent()
        .get(&RevenueDataKey::Schedule(subscription_id))
}

/// Update the merchant's cumulative recognised/deferred balances after a charge.
pub fn update_merchant_revenue_balances(
    env: &Env,
    merchant: &Address,
    recognised_delta: i128,
    deferred_delta: i128,
) {
    let prev_recognised: i128 = env
        .storage()
        .persistent()
        .get(&RevenueDataKey::RecognisedRevenue(merchant.clone()))
        .unwrap_or(0i128);
    let prev_deferred: i128 = env
        .storage()
        .persistent()
        .get(&RevenueDataKey::DeferredRevenue(merchant.clone()))
        .unwrap_or(0i128);

    env.storage().persistent().set(
        &RevenueDataKey::RecognisedRevenue(merchant.clone()),
        &(prev_recognised + recognised_delta),
    );
    env.storage().persistent().set(
        &RevenueDataKey::DeferredRevenue(merchant.clone()),
        &(prev_deferred + deferred_delta),
    );
}

/// Compute per-period revenue analytics for a merchant across all tracked subscriptions.
pub fn get_revenue_analytics_by_period(
    env: &Env,
    merchant: &Address,
    period_secs: u64,
    from: u64,
    to: u64,
) -> Vec<PeriodRevenue> {
    assert!(period_secs > 0, "period_secs must be > 0");
    assert!(to >= from, "to must be >= from");

    let sub_ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&RevenueDataKey::MerchantSubscriptions(merchant.clone()))
        .unwrap_or(Vec::new(env));

    // Build period buckets.
    let num_buckets = ((to - from + period_secs - 1) / period_secs) as u32;
    let mut buckets: Vec<PeriodRevenue> = Vec::new(env);
    for i in 0..num_buckets {
        let start = from + (i as u64) * period_secs;
        let end = start + period_secs;
        buckets.push_back(PeriodRevenue {
            period_start: start,
            period_end: end,
            recognised_amount: 0,
            subscription_count: 0,
        });
    }

    // Accumulate schedule entries into buckets.
    for sub_id in sub_ids.iter() {
        let maybe_schedule: Option<RevenueSchedule> = env
            .storage()
            .persistent()
            .get(&RevenueDataKey::Schedule(sub_id));
        if let Some(schedule) = maybe_schedule {
            let mut contributed = false;
            for entry in schedule.entries.iter() {
                // Find which bucket this entry's period_start falls into.
                if entry.period_start < from || entry.period_start >= to {
                    continue;
                }
                let bucket_idx = ((entry.period_start - from) / period_secs) as u32;
                if bucket_idx < num_buckets {
                    let mut bucket = buckets.get_unchecked(bucket_idx);
                    bucket.recognised_amount += entry.recognised_amount;
                    if !contributed {
                        bucket.subscription_count += 1;
                        contributed = true;
                    }
                    buckets.set(bucket_idx, bucket);
                }
            }
        }
    }

    buckets
}

/// Register a subscription under a merchant for analytics tracking.
/// Safe to call multiple times — deduplicates by subscription_id.
pub fn track_merchant_subscription(env: &Env, merchant: &Address, subscription_id: u64) {
    let mut ids: Vec<u64> = env
        .storage()
        .persistent()
        .get(&RevenueDataKey::MerchantSubscriptions(merchant.clone()))
        .unwrap_or(Vec::new(env));
    // Deduplicate: only add if not already tracked.
    for existing in ids.iter() {
        if existing == subscription_id {
            return;
        }
    }
    ids.push_back(subscription_id);
    env.storage()
        .persistent()
        .set(&RevenueDataKey::MerchantSubscriptions(merchant.clone()), &ids);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{contract, contractimpl, Env};

    fn make_env() -> Env {
        Env::default()
    }

    // ── straight-line schedule ────────────────────────────────────────────────

    #[test]
    fn test_straight_line_schedule_even_split() {
        let env = make_env();
        // 1200 stroops over 4 periods of 100s each, starting at t=0.
        let schedule = build_straight_line_schedule(&env, 1, 1200, 0, 100, 4);
        assert_eq!(schedule.total_amount, 1200);
        assert_eq!(schedule.entries.len(), 4);
        for entry in schedule.entries.iter() {
            assert_eq!(entry.recognised_amount, 300);
        }
    }

    #[test]
    fn test_straight_line_schedule_remainder_in_last_entry() {
        let env = make_env();
        // 1000 stroops over 3 periods → 333 + 333 + 334.
        let schedule = build_straight_line_schedule(&env, 1, 1000, 0, 100, 3);
        assert_eq!(schedule.entries.get_unchecked(0).recognised_amount, 333);
        assert_eq!(schedule.entries.get_unchecked(1).recognised_amount, 333);
        assert_eq!(schedule.entries.get_unchecked(2).recognised_amount, 334);
    }

    #[test]
    fn test_straight_line_single_period() {
        let env = make_env();
        let schedule = build_straight_line_schedule(&env, 1, 500, 1000, 2_592_000, 1);
        assert_eq!(schedule.entries.len(), 1);
        assert_eq!(schedule.entries.get_unchecked(0).recognised_amount, 500);
        assert_eq!(schedule.entries.get_unchecked(0).period_start, 1000);
        assert_eq!(schedule.entries.get_unchecked(0).period_end, 1000 + 2_592_000);
    }

    // ── usage-based schedule ──────────────────────────────────────────────────

    #[test]
    fn test_usage_based_schedule_single_entry() {
        let env = make_env();
        let schedule = build_usage_based_schedule(&env, 2, 800, 500, 2_592_000);
        assert_eq!(schedule.entries.len(), 1);
        let entry = schedule.entries.get_unchecked(0);
        assert_eq!(entry.recognised_amount, 800);
        assert_eq!(entry.period_start, 500);
        assert_eq!(entry.period_end, 500 + 2_592_000);
        assert!(!entry.is_recognised);
    }

    // ── split_recognised_deferred ─────────────────────────────────────────────

    #[test]
    fn test_split_all_deferred_before_period_start() {
        let env = make_env();
        // Period starts at t=1000, ends at t=2000. Query at t=500.
        let schedule = build_straight_line_schedule(&env, 1, 1000, 1000, 1000, 1);
        let (rec, def) = split_recognised_deferred(&schedule, 500);
        assert_eq!(rec, 0);
        assert_eq!(def, 1000);
    }

    #[test]
    fn test_split_all_recognised_after_period_end() {
        let env = make_env();
        let schedule = build_straight_line_schedule(&env, 1, 1000, 0, 1000, 1);
        let (rec, def) = split_recognised_deferred(&schedule, 2000);
        assert_eq!(rec, 1000);
        assert_eq!(def, 0);
    }

    #[test]
    fn test_split_partial_recognition_midway() {
        let env = make_env();
        // 1000 stroops, period 0..1000. Query at t=500 (50% elapsed).
        let schedule = build_straight_line_schedule(&env, 1, 1000, 0, 1000, 1);
        let (rec, def) = split_recognised_deferred(&schedule, 500);
        assert_eq!(rec, 500);
        assert_eq!(def, 500);
    }

    #[test]
    fn test_split_multi_period_partial() {
        let env = make_env();
        // 1200 stroops, 4 periods of 100s each starting at t=0.
        // Query at t=250 → first 2 periods fully recognised (300+300=600),
        // third period 50% recognised (150), fourth fully deferred (300).
        let schedule = build_straight_line_schedule(&env, 1, 1200, 0, 100, 4);
        let (rec, def) = split_recognised_deferred(&schedule, 250);
        assert_eq!(rec, 600 + 150); // 750
        assert_eq!(def, 150 + 300); // 450
    }

    // ── cancellation mid-period ───────────────────────────────────────────────

    #[test]
    fn test_cancellation_mid_period_partial_recognition() {
        let env = make_env();
        // Subscription charged 1000 stroops for a 1000s period.
        // Cancelled at t=300 (30% through).
        let schedule = build_straight_line_schedule(&env, 1, 1000, 0, 1000, 1);
        let (rec, def) = split_recognised_deferred(&schedule, 300);
        assert_eq!(rec, 300);
        assert_eq!(def, 700);
    }

    // ── contract-level helpers ────────────────────────────────────────────────
    // Soroban storage is only accessible inside a contract context.
    // We use a thin wrapper contract to host the storage calls.

    use soroban_sdk::testutils::Address as _;

    #[contract]
    pub struct RevenueTestContract;

    #[contractimpl]
    impl RevenueTestContract {
        pub fn set_rule(env: Env, plan_id: u64, method: RecognitionMethod, period: u64) {
            set_recognition_rule(&env, RevenueRecognitionRule { plan_id, method, recognition_period: period });
        }
        pub fn get_rule(env: Env, plan_id: u64) -> Option<RevenueRecognitionRule> {
            get_recognition_rule(&env, plan_id)
        }
        pub fn gen_schedule(env: Env, sub_id: u64, plan_id: u64, amount: i128, charge: u64, interval: u64) -> RevenueSchedule {
            generate_revenue_schedule(&env, sub_id, plan_id, amount, charge, interval)
        }
        pub fn recognize(env: Env, sub_id: u64, merchant: Address, now: u64) -> Recognition {
            recognize_revenue(&env, sub_id, merchant, now)
        }
        pub fn get_deferred(env: Env, merchant: Address) -> i128 {
            get_deferred_revenue(&env, merchant)
        }
        pub fn update_balances(env: Env, merchant: Address, rec_delta: i128, def_delta: i128) {
            update_merchant_revenue_balances(&env, &merchant, rec_delta, def_delta);
        }
        pub fn analytics(env: Env, merchant: Address, period: u64, from: u64, to: u64) -> soroban_sdk::Vec<PeriodRevenue> {
            get_revenue_analytics_by_period(&env, &merchant, period, from, to)
        }
        pub fn track(env: Env, merchant: Address, sub_id: u64) {
            track_merchant_subscription(&env, &merchant, sub_id);
        }
        pub fn get_schedule(env: Env, sub_id: u64) -> Option<RevenueSchedule> {
            get_revenue_schedule(&env, sub_id)
        }
    }

    fn setup_revenue_client(env: &Env) -> RevenueTestContractClient<'_> {
        let id = env.register_contract(None, RevenueTestContract);
        RevenueTestContractClient::new(env, &id)
    }

    #[test]
    fn test_set_and_get_recognition_rule() {
        let env = make_env();
        env.mock_all_auths();
        let client = setup_revenue_client(&env);
        client.set_rule(&42u64, &RecognitionMethod::StraightLine, &86_400u64);
        let fetched = client.get_rule(&42u64).expect("rule should exist");
        assert_eq!(fetched.plan_id, 42);
        assert_eq!(fetched.recognition_period, 86_400);
    }

    #[test]
    fn test_get_recognition_rule_missing_returns_none() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        assert!(client.get_rule(&999u64).is_none());
    }

    #[test]
    fn test_generate_revenue_schedule_straight_line_rule() {
        let env = make_env();
        env.mock_all_auths();
        let client = setup_revenue_client(&env);
        client.set_rule(&1u64, &RecognitionMethod::StraightLine, &2_592_000u64);
        let schedule = client.gen_schedule(&1u64, &1u64, &500i128, &0u64, &2_592_000u64);
        assert_eq!(schedule.entries.len(), 1);
        assert_eq!(schedule.entries.get_unchecked(0).recognised_amount, 500);
    }

    #[test]
    fn test_generate_revenue_schedule_usage_based_rule() {
        let env = make_env();
        env.mock_all_auths();
        let client = setup_revenue_client(&env);
        client.set_rule(&2u64, &RecognitionMethod::UsageBased, &2_592_000u64);
        let schedule = client.gen_schedule(&1u64, &2u64, &800i128, &0u64, &2_592_000u64);
        assert_eq!(schedule.entries.len(), 1);
        assert_eq!(schedule.entries.get_unchecked(0).recognised_amount, 800);
    }

    #[test]
    fn test_generate_revenue_schedule_no_rule_defaults_to_single_period() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let schedule = client.gen_schedule(&1u64, &99u64, &600i128, &0u64, &2_592_000u64);
        assert_eq!(schedule.entries.len(), 1);
        assert_eq!(schedule.entries.get_unchecked(0).recognised_amount, 600);
    }

    #[test]
    fn test_recognize_revenue_snapshot() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let merchant = Address::generate(&env);
        client.gen_schedule(&1u64, &99u64, &1000i128, &0u64, &1000u64);
        let rec = client.recognize(&1u64, &merchant, &600u64);
        assert_eq!(rec.recognised_revenue, 600);
        assert_eq!(rec.deferred_revenue, 400);
        assert_eq!(rec.as_of, 600);
    }

    #[test]
    fn test_deferred_revenue_balance_accumulates() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let merchant = Address::generate(&env);
        client.update_balances(&merchant, &0i128, &500i128);
        client.update_balances(&merchant, &0i128, &300i128);
        assert_eq!(client.get_deferred(&merchant), 800);
    }

    #[test]
    fn test_deferred_revenue_balance_zero_for_unknown_merchant() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let merchant = Address::generate(&env);
        assert_eq!(client.get_deferred(&merchant), 0);
    }

    #[test]
    fn test_revenue_analytics_by_period() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let merchant = Address::generate(&env);
        client.gen_schedule(&1u64, &99u64, &1000i128, &0u64, &100u64);
        client.gen_schedule(&2u64, &99u64, &2000i128, &0u64, &100u64);
        client.track(&merchant, &1u64);
        client.track(&merchant, &2u64);
        let analytics = client.analytics(&merchant, &100u64, &0u64, &200u64);
        assert_eq!(analytics.len(), 2);
        let bucket0 = analytics.get_unchecked(0);
        assert_eq!(bucket0.recognised_amount, 3000);
        assert_eq!(bucket0.subscription_count, 2);
    }

    #[test]
    fn test_track_merchant_subscription_accumulates() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let merchant = Address::generate(&env);
        client.track(&merchant, &10u64);
        client.track(&merchant, &20u64);
        // Verify via analytics: two subscriptions tracked.
        // (We can't read storage directly outside a contract context.)
        // Instead, generate schedules and check analytics count.
        client.gen_schedule(&10u64, &99u64, &100i128, &0u64, &100u64);
        client.gen_schedule(&20u64, &99u64, &200i128, &0u64, &100u64);
        let analytics = client.analytics(&merchant, &100u64, &0u64, &100u64);
        assert_eq!(analytics.get_unchecked(0).subscription_count, 2);
    }

    // ── multi-element arrangement ─────────────────────────────────────────────

    #[test]
    fn test_multi_element_arrangement_deferred_balances() {
        let env = make_env();
        let client = setup_revenue_client(&env);
        let merchant = Address::generate(&env);
        client.update_balances(&merchant, &0i128, &500i128);
        client.update_balances(&merchant, &0i128, &300i128);
        client.update_balances(&merchant, &0i128, &200i128);
        assert_eq!(client.get_deferred(&merchant), 1000);
        // Recognise 500.
        client.update_balances(&merchant, &500i128, &-500i128);
        assert_eq!(client.get_deferred(&merchant), 500);
    }

    // ── contract modification: plan rule update ───────────────────────────────

    #[test]
    fn test_recognition_rule_can_be_updated() {
        let env = make_env();
        env.mock_all_auths();
        let client = setup_revenue_client(&env);
        client.set_rule(&5u64, &RecognitionMethod::StraightLine, &86_400u64);
        client.set_rule(&5u64, &RecognitionMethod::UsageBased, &86_400u64);
        let rule = client.get_rule(&5u64).unwrap();
        assert_eq!(rule.method, RecognitionMethod::UsageBased);
    }
}
