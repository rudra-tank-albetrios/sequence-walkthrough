## Reading

1. List the top-level folders once.
2. Find the flow's entry point with one search (route path, handler or job name).
3. If a README or reference file covers that folder or file, read it first.
4. If it answers with confidence, use it and leave those files closed: a step whose file stayed closed has no `@ref`. If it is missing, unclear or looks older than the code, read only the code lines you need.
5. Read each file once, in call order. Never read tests, unrelated docs or files off the path.
6. A `@ref` or `@uses` path may point only to code you really opened. Nothing is guessed: what you did not see gets `%% @unconfirmed <what>`. If the flow's code cannot be found, ask for the path.
