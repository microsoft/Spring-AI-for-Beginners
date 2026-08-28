# Contributing

Thank you for your interest in contributing!  We welcome pull
requests and improvements to this course.  Please follow these
guidelines when submitting changes:

1. **No secrets in commits.** Never commit API keys or any
   confidential material.  Use a local `.env` for your own testing.
2. **Keep changes focused.** Small, scoped pull requests are easier
   to review and maintain.  If you're fixing multiple issues, please
   submit them separately.
3. **Add tests where possible.** Unit or integration tests help
   catch regressions.  For Spring Boot modules, include tests under
   the `src/test/java` folder.
4. **Follow code style conventions.** Use the existing project
   structure as a guide.  We rely on Maven to manage dependencies and
   the Spring Boot Maven plugin to package applications.  Shared
   dependencies, plugin versions, and the `repackage` execution live in
   the root `pom.xml`; add a dependency to a module's own `pom.xml` only
   when that module actually needs it.

Thank you for helping make this course better!