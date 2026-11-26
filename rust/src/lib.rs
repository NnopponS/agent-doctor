use serde::Serialize;
use serde_json::{Map, Value};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_BYTES: usize = 1_000_000;
const MAX_TOOLS: usize = 500;
const DESCRIPTION_BUDGET: usize = 1_024;

pub struct Catalog {
    tools: BTreeMap<String, Tool>,
    compact_bytes: usize,
}

struct Tool {
    description: Option<String>,
    schema: Option<Map<String, Value>>,
    raw: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Audit {
    pub tool_count: usize,
    pub compact_bytes: usize,
    pub findings: Vec<Finding>,
}

#[derive(Debug, Serialize)]
pub struct Finding {
    pub code: &'static str,
    pub tool: String,
    pub message: &'static str,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Comparison {
    pub baseline: Audit,
    pub candidate: Audit,
    pub breaking_count: usize,
    pub changes: Vec<Change>,
}

#[derive(Debug, Serialize)]
pub struct Change {
    pub breaking: bool,
    pub code: &'static str,
    pub tool: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub property: Option<String>,
    pub message: &'static str,
}

pub fn parse(input: &[u8]) -> Result<Catalog, String> {
    if input.len() > MAX_BYTES {
        return Err(format!("Input exceeds the {MAX_BYTES}-byte limit."));
    }
    let json: Value = serde_json::from_slice(input)
        .map_err(|e| format!("Invalid JSON at line {}, column {}.", e.line(), e.column()))?;
    if json.get("error").is_some() {
        return Err("Expected a successful tool list, received an error envelope.".into());
    }
    let tools = json
        .as_array()
        .or_else(|| json.get("tools").and_then(Value::as_array))
        .or_else(|| json.pointer("/result/tools").and_then(Value::as_array))
        .ok_or("Expected a tool array, {tools: [...]}, or {result: {tools: [...]}}.")?;
    if tools.len() > MAX_TOOLS {
        return Err(format!("The list exceeds the {MAX_TOOLS}-tool limit."));
    }
    // Count bytes of tool data only, so wrappers and formatting do not move the metric.
    let compact_bytes = serde_json::to_vec(tools)
        .map_err(|_| "Could not encode the tool list.")?
        .len();
    let mut catalog = BTreeMap::new();
    for (index, tool) in tools.iter().enumerate() {
        let name = tool
            .get("name")
            .and_then(Value::as_str)
            .filter(|n| !n.trim().is_empty() && n.len() <= 256 && !n.chars().any(char::is_control))
            .ok_or_else(|| {
                format!(
                    "Tool {} needs a valid name (1 to 256 bytes, no control characters).",
                    index + 1
                )
            })?;
        let value = Tool {
            description: tool
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_owned),
            schema: tool.get("inputSchema").and_then(Value::as_object).cloned(),
            raw: tool.clone(),
        };
        if catalog.insert(name.to_owned(), value).is_some() {
            return Err(format!("Tool {} duplicates an earlier name.", index + 1));
        }
    }
    Ok(Catalog {
        tools: catalog,
        compact_bytes,
    })
}

pub fn audit(catalog: &Catalog) -> Audit {
    let mut findings = Vec::new();
    for (name, tool) in &catalog.tools {
        let mut report = |code, message| {
            findings.push(Finding {
                code,
                tool: name.clone(),
                message,
            })
        };
        match tool.description.as_deref().map(str::trim) {
            None | Some("") => report("AD001", "Add a description that says when to use this tool."),
            Some(d) if d.len() > DESCRIPTION_BUDGET => report("AD002", "Description exceeds the 1 KiB review threshold; keep usage and constraints prominent."),
            _ => {}
        }
        match &tool.schema {
            None => report(
                "AD003",
                "Provide an object-valued inputSchema, even for a tool with no arguments.",
            ),
            Some(s) => {
                if s.get("type").and_then(Value::as_str) != Some("object") {
                    report("AD004", "Declare an object input schema explicitly.");
                }
                if let Some(req) = s.get("required") {
                    if string_set(Some(req)).is_none() || !req.is_array() {
                        report("AD005", "Use an array of strings for required properties.");
                    }
                }
                if s.get("properties").is_some_and(|p| !p.is_object()) {
                    report("AD006", "Use an object for properties.");
                }
            }
        }
    }
    Audit {
        tool_count: catalog.tools.len(),
        compact_bytes: catalog.compact_bytes,
        findings,
    }
}

pub fn compare(before: &Catalog, after: &Catalog) -> Comparison {
    let mut changes = Vec::new();
    let names: BTreeSet<_> = before.tools.keys().chain(after.tools.keys()).collect();
    for name in names {
        let mut record = |breaking, code, property, message| {
            changes.push(Change {
                breaking,
                code,
                tool: name.clone(),
                property,
                message,
            })
        };
        match (before.tools.get(name), after.tools.get(name)) {
            (Some(old), Some(new)) => {
                if old.description != new.description {
                    record(
                        false,
                        "description-changed",
                        None,
                        "Review wording changes for agent routing.",
                    );
                }
                match (&old.schema, &new.schema) {
                    (Some(old), Some(new)) => compare_inputs(old, new, &mut record),
                    (Some(_), None) => record(
                        true,
                        "input-schema-lost",
                        None,
                        "Candidate no longer supplies an object input schema.",
                    ),
                    (None, Some(_)) => record(
                        false,
                        "input-schema-added",
                        None,
                        "Candidate now supplies an object input schema; verify consumers.",
                    ),
                    _ => {}
                }
                if !other_fields_equal(&old.raw, &new.raw) {
                    record(
                        false,
                        "tool-metadata-changed",
                        None,
                        "Other tool metadata changed; review affected consumers.",
                    );
                }
            }
            (Some(_), None) => record(
                true,
                "tool-removed",
                None,
                "Existing callers can no longer invoke this tool.",
            ),
            (None, Some(_)) => record(false, "tool-added", None, "New tool available."),
            (None, None) => {}
        }
    }
    let breaking_count = changes.iter().filter(|c| c.breaking).count();
    Comparison {
        baseline: audit(before),
        candidate: audit(after),
        breaking_count,
        changes,
    }
}

fn other_fields_equal(old: &Value, new: &Value) -> bool {
    let old = old.as_object().expect("parsed tool");
    let new = new.as_object().expect("parsed tool");
    old.keys()
        .chain(new.keys())
        .filter(|k| !matches!(k.as_str(), "name" | "description" | "inputSchema"))
        .all(|k| old.get(k) == new.get(k))
}

type Note<'a> = dyn FnMut(bool, &'static str, Option<String>, &'static str) + 'a;

fn compare_inputs(old: &Map<String, Value>, new: &Map<String, Value>, record: &mut Note<'_>) {
    let empty = Map::new();
    let old_properties = old
        .get("properties")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    let new_properties = new
        .get("properties")
        .and_then(Value::as_object)
        .unwrap_or(&empty);
    if let (Some(previous), Some(current)) = (required(old), required(new)) {
        for key in current.difference(&previous) {
            record(
                true,
                "required-added",
                Some((*key).to_owned()),
                "Previously valid callers may omit this argument.",
            );
        }
        for key in previous.difference(&current) {
            record(
                false,
                "required-removed",
                Some((*key).to_owned()),
                "This argument is no longer required.",
            );
        }
    } else if old.get("required") != new.get("required") {
        record(
            false,
            "required-review",
            None,
            "A required declaration is invalid; inspect the source schema.",
        );
    }
    let open = new.get("additionalProperties") != Some(&Value::Bool(false));
    if !open && old.get("additionalProperties") != Some(&Value::Bool(false)) {
        record(
            true,
            "additional-properties-closed",
            None,
            "Candidate explicitly rejects undeclared arguments.",
        );
    }
    if narrows_type(old.get("type"), new.get("type")) {
        record(
            true,
            "type-narrowed",
            None,
            "The root input type excludes a previously accepted type.",
        );
    }
    for (name, previous) in old_properties {
        let Some(current) = new_properties.get(name) else {
            record(
                !open,
                "property-removed",
                Some(name.clone()),
                "Previously declared argument has been removed.",
            );
            continue;
        };
        if narrows_type(previous.get("type"), current.get("type")) {
            record(
                true,
                "type-narrowed",
                Some(name.clone()),
                "The argument type excludes a previously accepted type.",
            );
        }
        if let Some(new_values) = current.get("enum").and_then(Value::as_array) {
            let narrowed = previous
                .get("enum")
                .and_then(Value::as_array)
                .is_none_or(|old_values| old_values.iter().any(|v| !new_values.contains(v)));
            if narrowed {
                record(
                    true,
                    "enum-narrowed",
                    Some(name.clone()),
                    "Candidate limits or removes an allowed argument value.",
                );
            }
        }
        if previous != current {
            record(
                false,
                "property-schema-changed",
                Some(name.clone()),
                "Review the complete argument schema; the gate checks selected constraints only.",
            );
        }
    }
    for name in new_properties
        .keys()
        .filter(|name| !old_properties.contains_key(*name))
    {
        record(
            false,
            "property-added",
            Some(name.clone()),
            "Newly declared argument; check defaults and optionality.",
        );
    }
    if old
        .keys()
        .chain(new.keys())
        .filter(|k| !matches!(k.as_str(), "properties" | "required" | "type"))
        .any(|k| old.get(k) != new.get(k))
        || (old.get("properties") != new.get("properties")
            && (old.get("properties").is_some_and(|v| !v.is_object())
                || new.get("properties").is_some_and(|v| !v.is_object())))
        || (old.get("type") != new.get("type")
            && (string_set(old.get("type")).is_none() || string_set(new.get("type")).is_none()))
    {
        record(
            false,
            "input-schema-review",
            None,
            "Other input schema constraints changed; review them manually.",
        );
    }
}

fn required(schema: &Map<String, Value>) -> Option<BTreeSet<&str>> {
    match schema.get("required") {
        None => Some(BTreeSet::new()),
        Some(r) if r.is_array() => string_set(Some(r)),
        Some(_) => None,
    }
}

fn string_set(value: Option<&Value>) -> Option<BTreeSet<&str>> {
    match value? {
        Value::String(s) => Some(BTreeSet::from([s.as_str()])),
        Value::Array(a) => a.iter().map(Value::as_str).collect(),
        _ => None,
    }
}

fn narrows_type(old: Option<&Value>, new: Option<&Value>) -> bool {
    let Some(current) = string_set(new) else {
        return false;
    };
    if old.is_none() {
        return true;
    }
    string_set(old).is_some_and(|previous| {
        previous
            .iter()
            .any(|v| !current.contains(v) && !(*v == "integer" && current.contains("number")))
    })
}
