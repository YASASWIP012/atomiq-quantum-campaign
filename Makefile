# One-command reproduction:  make setup && make all
PY ?= .venv/bin/python
export PYTHONPATH := src

.PHONY: setup all stage1 stage2 stage3 test check hardware clean

setup:
	python3.12 -m venv .venv || uv venv --python 3.12 .venv
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -r requirements.txt

all: stage1 stage2 stage3 test check

stage1:
	$(PY) -m atomiq.stage1

stage2:
	$(PY) -m atomiq.stage2

stage3:
	$(PY) -m atomiq.stage3

test:
	$(PY) -m pytest -q

check:
	$(PY) scripts/check_submission.py

hardware:   # optional, needs IBM_QUANTUM_TOKEN; then rerun `make stage2 stage3 check`
	$(PY) scripts/run_hardware.py

clean:
	rm -f stage1_predictions.csv stage2_selection.* stage3_simulation.* results/*.json results/*.csv results/*.npy figures/*.png
