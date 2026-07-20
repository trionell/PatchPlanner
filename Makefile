.PHONY: build

build:
	cd frontend && npm run build
	rm -rf backend/cmd/dist
	cp -r frontend/dist backend/cmd/dist
	cd backend && go build -o patchplanner ./cmd
