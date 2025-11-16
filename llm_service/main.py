from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForCausalLM
import uvicorn

MODEL_NAME = "google/gemma-3-1b-it"
app = FastAPI(title="LLM Service")

class QueryRequest(BaseModel):
	prompt: str

MODEL_LOAD_ERROR = ""

try:
	tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
	model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
	MODEL_LOADED = True
except Exception as load_error:
	tokenizer = None
	model = None
	MODEL_LOADED = False
	MODEL_LOAD_ERROR = str(load_error)


def run_inference(prompt: str) -> str:
	if not MODEL_LOADED or tokenizer is None or model is None:
		raise RuntimeError("Model is not available")

	messages = [
		{
			"role": "user",
			"content": (
				"Słuzby miejskie odpowiadaja za sprzatanie drog, naprawe ogrzewania, dziury w drodze, "
				"zepsuta komunikacje miejska, naprawiaja siec energetyczna. Sluzby ratunkowe odpowiadaja "
				"tylko w sytuacji powaznego zagrozenia zycia. Odpowiedz jedną z dwóch opcji: SŁUŻBY RATUNKOWE "
				"lub SŁUŻBY MIEJSKIE. Przeanalizuj zgloszenie: "
				+ prompt
			),
		}
	]

	inputs = tokenizer.apply_chat_template(
		messages,
		add_generation_prompt=True,
		tokenize=True,
		return_dict=True,
		return_tensors="pt",
	).to(model.device)

	outputs = model.generate(**inputs, max_new_tokens=40)
	return tokenizer.decode(
		outputs[0][inputs["input_ids"].shape[-1]:], skip_special_tokens=True
	).strip()


@app.get("/health")
async def health() -> dict:
	status = {"model": MODEL_NAME, "loaded": MODEL_LOADED}
	if not MODEL_LOADED:
		status["error"] = MODEL_LOAD_ERROR
	return status


@app.post("/query_message")
async def query_message(request: QueryRequest) -> dict:
	try:
		response = run_inference(request.prompt)
	except Exception as exc:
		raise HTTPException(status_code=500, detail=str(exc)) from exc
	return {"response": response}


if __name__ == "__main__":
	uvicorn.run("main:app", host="0.0.0.0", port=8123, reload=False)