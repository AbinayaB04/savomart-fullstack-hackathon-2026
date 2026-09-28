from typing import Dict, Any


def generate_template_summary(facts: Dict[str, Any]) -> str:
    """
    Deterministically generates an explainable textual summary from structured facts.
    Used when LLM_PROVIDER is 'none' or when LLM call fails / fails hallucination checks.
    """
    area_name = facts.get("area_name", "Selected Area")
    overall_score = facts.get("overall_score", 0)
    density_score = facts.get("density_score", 0)
    competition_score = facts.get("competition_score", 0)
    transit_score = facts.get("transit_score", 0)
    supermarket_count = facts.get("supermarket_count", 0)
    grocery_count = facts.get("grocery_count", 0)
    transit_count = facts.get("transit_count", 0)
    est_population = facts.get("est_population", 0)

    summary = (
        f"{area_name} achieves an overall expansion fitness score of {overall_score}/100. "
        f"Demand indicators show an estimated population of {est_population} with a density subscore of {density_score}/100. "
        f"Local retail landscape contains {supermarket_count} direct supermarket competitors and {grocery_count} local grocery outlets, "
        f"yielding a competitive viability score of {competition_score}/100. "
        f"Transit connectivity features {transit_count} transit stops (score: {transit_score}/100)."
    )
    return summary
