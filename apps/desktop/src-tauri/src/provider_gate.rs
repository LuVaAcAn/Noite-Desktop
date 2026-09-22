use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const CAPACITY: f64 = 5.0;
const REFILL_PER_SECOND: f64 = 20.0 / 60.0;

#[derive(Default)]
struct GateState {
    tokens: f64,
    last_refill: Option<Instant>,
    in_flight: bool,
    cooldown_until: Option<Instant>,
}

static GATES: OnceLock<Mutex<HashMap<&'static str, GateState>>> = OnceLock::new();

#[derive(Debug)]
pub struct RequestPermit {
    provider: &'static str,
}

impl Drop for RequestPermit {
    fn drop(&mut self) {
        if let Ok(mut gates) = GATES.get_or_init(|| Mutex::new(HashMap::new())).lock() {
            gates.entry(self.provider).or_default().in_flight = false;
        }
    }
}

pub fn acquire(provider: &'static str) -> Result<RequestPermit, u64> {
    let now = Instant::now();
    let mut gates = GATES
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .map_err(|_| 1_u64)?;
    let state = gates.entry(provider).or_insert_with(|| GateState {
        tokens: CAPACITY,
        last_refill: Some(now),
        ..Default::default()
    });
    if let Some(until) = state.cooldown_until.filter(|until| *until > now) {
        return Err(until.duration_since(now).as_secs().max(1));
    }
    let elapsed = state
        .last_refill
        .map(|last| now.duration_since(last).as_secs_f64())
        .unwrap_or_default();
    state.tokens = (state.tokens + elapsed * REFILL_PER_SECOND).min(CAPACITY);
    state.last_refill = Some(now);
    if state.in_flight {
        return Err(1);
    }
    if state.tokens < 1.0 {
        return Err(((1.0 - state.tokens) / REFILL_PER_SECOND).ceil() as u64);
    }
    state.tokens -= 1.0;
    state.in_flight = true;
    Ok(RequestPermit { provider })
}

pub fn cooldown(provider: &'static str, seconds: u64) {
    if let Ok(mut gates) = GATES.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        gates.entry(provider).or_default().cooldown_until =
            Some(Instant::now() + Duration::from_secs(seconds.clamp(1, 300)));
    }
}

pub fn retry_after(response: &reqwest::Response) -> u64 {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse().ok())
        .unwrap_or(30)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blocks_parallel_requests_for_a_provider() {
        let first = acquire("test-parallel").unwrap();
        assert_eq!(acquire("test-parallel").err(), Some(1));
        drop(first);
        assert!(acquire("test-parallel").is_ok());
    }
    #[test]
    fn applies_provider_cooldown() {
        cooldown("test-cooldown", 4);
        assert!(acquire("test-cooldown").unwrap_err() >= 1);
    }
}
