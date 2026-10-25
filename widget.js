// Skosmos 3 plugin showing works from the Bibbi catalog that use the current authority.
// Skosmos calls window.bibbiKatalogWidget on page load and after each partial concept page load.
//
// Data comes from the BMDB search API (https://search.bmdb.no/cordata/v1/) through bmdb_proxy in vokabulartjenesten,
// which holds the API credentials. The list uses work summaries, and opening a work fetches the full work.

// The Bibbi subjects and their components (concepts, places, events and agents)
const BIBBI_VOCAB_IDS = ["bibbi", "bibbi-components"];
const BMDB_WORKS_ENDPOINT = "/bmdb/works";

// Labels are strings in work summaries and { nb, nn } objects in full works
const localized = (value) =>
  typeof value === "string" ? value : value?.nb ?? value?.nn ?? "";

const formatTitle = ({ mainTitle, subtitle, partNumber, partTitle }) =>
  mainTitle +
  (subtitle ? ` : ${subtitle}` : "") +
  (partNumber ? `. ${partNumber}` : "") +
  (partTitle ? `. ${partTitle}` : "");

const formatIsbdTitle = (title, parallelTitles = []) =>
  [title, ...parallelTitles].map(formatTitle).join(" = ");

const parsePublicationYear = (publicationYear) =>
  parseInt(publicationYear ?? "") || 0;

const agentClassname = (agent) =>
  agent.type === "Person" || agent.agentType?.code === "person" ? "person" : "organization";

const subjectClassname = (subject) =>
  ({
    place: "place",
    work: "work",
    collection_work: "work",
    agent: agentClassname(subject),
  })[subject.entityType] ?? "topic";

const mapContributor = ({ agent, roles, isMainContributor }) => ({
  id: agent.identifiers?.bibbiAuthorityId,
  label: localized(agent.name),
  role: roles.map((role) => localized(role.label)).join(", "),
  classname: agentClassname(agent),
  isMainContributor,
});

// Work summary from /bmdb/works?authority=…
const mapWorkSummary = (work) => ({
  id: work.id,
  // Music works can have a uniform title without mainTitle
  title: formatIsbdTitle(work.workTitle?.mainTitle ? work.workTitle : work.representation.title),
  coverImage: work.representation.coverImage,
  creator: work.contributors[0] ? localized(work.contributors[0].agent.name) : "",
});

// Full work from /bmdb/works/{id}
const mapWork = (work) => {
  const contributors = work.contributors.map(mapContributor);

  const manifestations = work.expressions
    .flatMap((expression) =>
      expression.manifestations.map((manifestation) => ({
        coverImage: manifestation.coverImage,
        title: formatIsbdTitle(manifestation.preferredTitle, manifestation.parallelTitles),
        publicationYear: parsePublicationYear(manifestation.publicationYear),
        publisher: (manifestation.publicationStatements ?? [])
          .map((statement) => statement.imprint?.name)
          .filter(Boolean)
          .join(", "),
        bibbiId: manifestation.identifiers?.bibbiId,
        isbn: manifestation.isbn ?? [],
        ean: manifestation.ean ?? [],
        documentType: [expression.expressionType?.label, manifestation.manifestationMedium?.label]
          .map(localized)
          .filter(Boolean)
          .join(", "),
        contributors: [
          ...(expression.contributors ?? []),
          ...(manifestation.contributors ?? []),
        ].map(mapContributor),
      }))
    )
    .sort((m1, m2) => m2.publicationYear - m1.publicationYear);

  const publicationYears = manifestations.map((m) => m.publicationYear).filter(Boolean);

  return {
    id: work.id,
    mainCreator: contributors.find((contributor) => contributor.isMainContributor),
    title: formatIsbdTitle(work.preferredTitle),
    firstPublicationYear: publicationYears.length ? Math.min(...publicationYears) : "",
    contributors,
    subjects: work.subjects.map((subject) => ({
      id: subject.identifiers?.bibbiAuthorityId,
      label: localized(subject.name),
      classname: subjectClassname(subject),
    })),
    genres: work.genres.map((genre) => ({
      id: genre.identifiers?.bibbiAuthorityId,
      label: localized(genre.name),
      classname: "genre",
    })),
    manifestations,
  };
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Authorities without a Bibbi ID (e.g. from other sources) are shown without a link
const renderAuthorityLink = ({ id, label, role, classname }) => `
  <div class="authorityLink ${escapeHtml(classname)}">
    ${id
      ? `<a href="/entity?uri=https://id.bs.no/bibbi/${encodeURIComponent(id)}">${escapeHtml(label)}</a>`
      : escapeHtml(label)}
    ${role ? `(${escapeHtml(role)})` : ""}
  </div>`;

const renderManifestation = (m) => `
  <li>
    <img alt="Omslagsbilde" src="${escapeHtml(m.coverImage)}">
    <div>
      <em>${escapeHtml(m.title)}</em>
      ${m.publisher ? `. ${escapeHtml(m.publisher)}` : ""}
      ${m.publicationYear ? `${m.publisher ? "," : ""} ${m.publicationYear}` : ""}
      <br>
      ${m.documentType ? `${escapeHtml(m.documentType)}.` : ""}
      ${m.bibbiId ? `Bibbi-ID ${escapeHtml(m.bibbiId)}` : ""}
      ${m.isbn.length ? `ISBN ${escapeHtml(m.isbn.join(", "))}` : ""}
      ${m.ean.length ? `EAN ${escapeHtml(m.ean.join(", "))}` : ""}
      <br>
      ${m.contributors.length
        ? `Bidragsytere (uttrykk og manifestasjon): ${m.contributors.map(renderAuthorityLink).join("")}`
        : ""}
      <p>
        ${m.isbn.length
          ? `<a href="http://bibsys-almaprimo.hosted.exlibrisgroup.com/primo_library/libweb/action/dlSearch.do?vid=BIBSYS&amp;institution=BIBSYS&amp;query=any,contains,${encodeURIComponent(m.isbn[0])}">Søk i Oria</a>`
          : ""}
      </p>
    </div>
  </li>`;

const renderWorkDetail = (work) => `
  <div class="bibbi-item-detail">
    <a href="#" class="back-link">« Tilbake</a>
    <h3>
      ${escapeHtml(work.title)} /
      ${work.mainCreator
        ? `${escapeHtml(work.mainCreator.label)} ${work.mainCreator.role ? `(${escapeHtml(work.mainCreator.role)})` : ""}`
        : ""}
      ${escapeHtml(work.firstPublicationYear)}
    </h3>
    <div class="bibbi-item-section">Bidragsytere (verk): ${work.contributors.map(renderAuthorityLink).join("")}</div>
    <div class="bibbi-item-section">Emne: ${work.subjects.map(renderAuthorityLink).join("")}</div>
    <div class="bibbi-item-section">Form/sjanger: ${work.genres.map(renderAuthorityLink).join("")}</div>
    <div>
      <strong>Manifestasjoner:</strong>
      <ul class="manifestations">${work.manifestations.map(renderManifestation).join("")}</ul>
    </div>
  </div>`;

const renderWorkList = (works, truncated) =>
  works.length
    ? `<div class="bibbi-item-list">${works
        .map(
          (work) => `
        <div class="item">
          <a href="#" data-work-id="${escapeHtml(work.id)}">
            <img alt="Omslagsbilde" src="${escapeHtml(work.coverImage)}">
            <div class="title">${escapeHtml(work.title)}</div>
            <div class="creator_year">${escapeHtml(work.creator)}</div>
          </a>
        </div>`
        )
        .join("")}</div>${truncated
        ? `<p class="text-muted">Viser de 100 nyeste verkene for hver måte autoriteten er brukt på (som bidragsyter, emne, sjanger eller form).</p>`
        : ""}`
    : `<div class="bibbi-item-list"><em class="text-muted">Ingen verk (Autoriteten kan være brukt på dokumenter som ikke er verkifisert enda)</em></div>`;

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
};

const ERROR_MESSAGE = "Kan ikke vise resultater fra Bibbi katalog akkurat nå på grunn av en feil.";

const BIBBI = {
  works: [],
  truncated: false,
  // Full works by ID, fetched when a work is opened
  fullWorks: new Map(),
  // Incremented for each query so that responses for a previous concept are ignored
  requestId: 0,

  removeWidget() {
    document.querySelectorAll(".skosmos-widget-bibbikatalog").forEach((el) => el.remove());
  },

  render(state) {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    const heading = `Bruk i Bibbi-katalogen${this.works.length ? ` (${this.works.length})` : ""}`;
    let body;
    if (state.loading) {
      body = `<div class="loading">Tøyeblikk...</div>`;
    } else if (state.error) {
      body = `<div class="error">${escapeHtml(state.error)}</div>`;
    } else if (state.selectedWork) {
      body = renderWorkDetail(state.selectedWork);
    } else {
      body = renderWorkList(this.works, this.truncated);
    }

    const widget = document.createElement("div");
    widget.className = "skosmos-widget-bibbikatalog main-content-section py-4";
    widget.innerHTML = `<h2 class="fs-4">${escapeHtml(heading)}</h2>${body}`;

    widget.querySelector("a.back-link")?.addEventListener("click", (evt) => {
      evt.preventDefault();
      this.render({});
    });

    widget.querySelectorAll("a[data-work-id]").forEach((link) => {
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        this.openWork(link.dataset.workId);
      });
    });

    this.removeWidget();
    mainContent.after(widget);
  },

  async query(uri) {
    const bibbiAuthorityId = uri.split("/").pop();
    if (!bibbiAuthorityId) return;

    const requestId = ++this.requestId;
    this.works = [];
    this.truncated = false;
    this.render({ loading: true });

    try {
      const res = await fetchJson(
        `${BMDB_WORKS_ENDPOINT}?${new URLSearchParams({ authority: bibbiAuthorityId })}`
      );
      if (requestId !== this.requestId) return;

      this.works = res.works.map(mapWorkSummary);
      this.truncated = res.truncated;
      this.render({});
    } catch (err) {
      if (requestId !== this.requestId) return;
      console.error("[skosmos-widget-bibbikatalog]", err);
      this.render({ error: ERROR_MESSAGE });
    }
  },

  async openWork(workId) {
    const requestId = this.requestId;
    if (!this.fullWorks.has(workId)) {
      this.render({ loading: true });
      try {
        const res = await fetchJson(`${BMDB_WORKS_ENDPOINT}/${encodeURIComponent(workId)}`);
        this.fullWorks.set(workId, mapWork(res.work));
      } catch (err) {
        if (requestId !== this.requestId) return;
        console.error("[skosmos-widget-bibbikatalog]", err);
        this.render({ error: ERROR_MESSAGE });
        return;
      }
    }
    if (requestId !== this.requestId) return;
    this.render({ selectedWork: this.fullWorks.get(workId) });
  },
};

window.bibbiKatalogWidget = function (data) {
  // Only activate the widget on Bibbi concept pages with a prefLabel.
  if (
    !BIBBI_VOCAB_IDS.includes(window.SKOSMOS.vocab) ||
    data.pageType !== "concept" ||
    !data.uri ||
    !data.prefLabels
  ) {
    BIBBI.requestId++;
    BIBBI.removeWidget();
    return;
  }
  BIBBI.query(data.uri);
};
