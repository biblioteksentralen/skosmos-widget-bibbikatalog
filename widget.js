// Skosmos 3 plugin showing works from the Bibbi catalog that use the current authority.
// Skosmos calls window.bibbiKatalogWidget on page load and after each partial concept page load.

const BIBBI_VOCAB_ID = "bibbi";
const BIBBI_ENDPOINT = "https://search.data.bs.no/cordata/global/api/work/search";

function formatIsbdTitle(title, parallelTitles) {
  const { mainTitle, subtitle, partNumber, partTitle } = title ?? {};
  return (
    mainTitle +
    (subtitle ? ` : ${subtitle}` : "") +
    (partNumber ? `. ${partNumber}` : "") +
    (partTitle ? `. ${partTitle}` : "") +
    (parallelTitles ?? [])
      .map(
        (parallelTitle) =>
          " = " +
          parallelTitle.mainTitle +
          (parallelTitle.subtitle ? ` : ${parallelTitle.subtitle}` : "") +
          (parallelTitle.partNumber ? `. ${parallelTitle.partNumber}` : "") +
          (parallelTitle.partTitle ? `. ${parallelTitle.partTitle}` : "")
      )
      .join("")
  );
}

const parsePublicationYear = (publicationYear) =>
  parseInt(publicationYear ?? "") || 0;

const sortByPublicationYearDesc = (manifestations) =>
  manifestations.sort(
    (a, b) =>
      parsePublicationYear(b.publicationYear) -
      parsePublicationYear(a.publicationYear)
  );

const getFirstWorkPublicationYear = (work) =>
  parsePublicationYear(
    sortByPublicationYearDesc(
      work.expressions.flatMap(({ manifestations }) => manifestations)
    )[0]?.publicationYear
  );

const getWorkYearOrFirstPublicationYear = (work) =>
  work.workYear ?? getFirstWorkPublicationYear(work);

const mapContributor = (contributor) => ({
  id: contributor.agent.id,
  label: contributor.agent.name.nb,
  role: contributor.roles.map((role) => role.label.nb).join(", "),
  classname: contributor.agent.type.toLowerCase(),
  isMainContributor: contributor.isMainContributor,
});

const mapWork = (work) => {
  const contributors = work.contributors.map(mapContributor);

  const manifestations = work.expressions
    .flatMap((expression) =>
      expression.manifestations.map((manifestation) => ({
        coverImage: manifestation.coverImage,
        title: formatIsbdTitle(manifestation.title, manifestation.parallelTitles),
        publicationYear: parsePublicationYear(manifestation.publicationYear),
        bibbiId: manifestation.identifiers.bibbiId,
        isbn: manifestation.isbn ?? [],
        ean: manifestation.ean ?? [],
        statementOfResponsibility: manifestation.statementOfResponsibility,
        documentType: manifestation.documentType?.format,
        contributors: [
          ...(expression.contributors ?? []),
          ...(manifestation.contributors ?? []),
        ].map(mapContributor),
      }))
    )
    .sort((m1, m2) => m2.publicationYear - m1.publicationYear);

  return {
    id: work.id,
    mainCreator: contributors.find((contributor) => contributor.isMainContributor),
    title: formatIsbdTitle(work.title, []),
    coverImage: manifestations
      .map((manifestation) => manifestation.coverImage)
      .find((url) => typeof url === "string"),
    workYear: work.workYear,
    workYearOrFirstPublicationYear: getWorkYearOrFirstPublicationYear(work),
    contributors,
    subjects: work.subjects.map((authority) => ({
      id: authority.id,
      label: authority.name.nb,
      classname: authority.focus?.type?.toLowerCase() ?? "topic",
    })),
    genres: work.genres.map((authority) => ({
      id: authority.id,
      label: authority.name.nb,
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

const renderAuthorityLink = ({ id, label, role, classname }) => `
  <div class="authorityLink ${escapeHtml(classname)}">
    <a href="/entity?uri=https://id.bs.no/bibbi/${encodeURIComponent(id)}">${escapeHtml(label)}</a>
    ${role ? `(${escapeHtml(role)})` : ""}
  </div>`;

const renderManifestation = (m) => `
  <li>
    <img alt="Omslagsbilde" src="${escapeHtml(m.coverImage)}">
    <div>
      <em>${escapeHtml(m.title)}</em>
      ${m.statementOfResponsibility ? `. ${escapeHtml(m.statementOfResponsibility)}` : ""}
      ${m.publicationYear ? `${m.statementOfResponsibility ? "," : ""} ${m.publicationYear}` : ""}
      <br>
      ${m.documentType ? `${escapeHtml(m.documentType)}.` : ""}
      ${m.bibbiId ? `Bibbi-ID ${escapeHtml(m.bibbiId)}` : ""}
      ${m.isbn.length ? `ISBN ${escapeHtml(m.isbn)}` : ""}
      ${m.ean.length ? `EAN ${escapeHtml(m.ean)}` : ""}
      <br>
      ${m.contributors.length
        ? `Bidragsytere (uttrykk og manifestasjon): ${m.contributors.map(renderAuthorityLink).join("")}`
        : ""}
      <p>
        ${m.isbn.length
          ? `<a href="http://bibsys-almaprimo.hosted.exlibrisgroup.com/primo_library/libweb/action/dlSearch.do?vid=BIBSYS&amp;institution=BIBSYS&amp;query=any,contains,${encodeURIComponent(m.isbn)}">Søk i Oria</a>`
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
      ${escapeHtml(work.workYear)}
    </h3>
    <div class="bibbi-item-section">Bidragsytere (verk): ${work.contributors.map(renderAuthorityLink).join("")}</div>
    <div class="bibbi-item-section">Emne: ${work.subjects.map(renderAuthorityLink).join("")}</div>
    <div class="bibbi-item-section">Form/sjanger: ${work.genres.map(renderAuthorityLink).join("")}</div>
    <div>
      <strong>Manifestasjoner:</strong>
      <ul class="manifestations">${work.manifestations.map(renderManifestation).join("")}</ul>
    </div>
  </div>`;

const renderWorkList = (works) =>
  works.length
    ? `<div class="bibbi-item-list">${works
        .map(
          (work) => `
        <div class="item">
          <a href="#" data-bibbi-id="${escapeHtml(work.id)}">
            <img alt="Omslagsbilde" src="${escapeHtml(work.coverImage)}">
            <div class="title">${escapeHtml(work.title)}</div>
            <div class="creator_year">
              ${work.mainCreator ? escapeHtml(work.mainCreator.label) : ""}
              ${escapeHtml(work.workYear)}
            </div>
          </a>
        </div>`
        )
        .join("")}</div>`
    : `<div class="bibbi-item-list"><em class="text-muted">Ingen verk (Autoriteten kan være brukt på dokumenter som ikke er verkifisert enda)</em></div>`;

const BIBBI = {
  works: [],
  // Incremented for each query so that responses for a previous concept are ignored
  requestId: 0,

  removeWidget() {
    document.querySelectorAll(".skosmos-widget-bibbikatalog").forEach((el) => el.remove());
  },

  render(state) {
    const mainContent = document.getElementById("main-content");
    if (!mainContent) return;

    const heading = `Bruk i Bibbi-katalogen${state.works?.length ? ` (${state.works.length})` : ""}`;
    let body;
    if (state.loading) {
      body = `<div class="loading">Tøyeblikk...</div>`;
    } else if (state.error) {
      body = `<div class="error">${escapeHtml(state.error)}</div>`;
    } else if (state.selectedWork) {
      body = renderWorkDetail(state.selectedWork);
    } else {
      body = renderWorkList(state.works);
    }

    const widget = document.createElement("div");
    widget.className = "skosmos-widget-bibbikatalog main-content-section py-4";
    widget.innerHTML = `<h2 class="fs-4">${escapeHtml(heading)}</h2>${body}`;

    widget.querySelector("a.back-link")?.addEventListener("click", (evt) => {
      evt.preventDefault();
      this.render({ works: this.works });
    });

    widget.querySelectorAll("a[data-bibbi-id]").forEach((link) => {
      link.addEventListener("click", (evt) => {
        evt.preventDefault();
        const selectedWork = this.works.find((work) => work.id === link.dataset.bibbiId);
        if (selectedWork) {
          this.render({ works: this.works, selectedWork });
        }
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
    this.render({ loading: true });

    try {
      const params = new URLSearchParams({
        "filter[bmdb.bibbiAuthorityId]": bibbiAuthorityId,
        size: "100",
        version: "0.6.1",
      });
      const response = await fetch(`${BIBBI_ENDPOINT}?${params}`, {
        headers: {
          "Content-Type": "application/json",
          "Client-Identifier": "Vokabulartjenesten/Skosmos (drift@bibsent.no)",
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const res = await response.json();
      if (requestId !== this.requestId) return;

      this.works = res.results
        .map((result) => mapWork(result.work))
        .sort((w1, w2) => w2.workYearOrFirstPublicationYear - w1.workYearOrFirstPublicationYear);
      this.render({ works: this.works });
    } catch (err) {
      if (requestId !== this.requestId) return;
      console.error("[skosmos-widget-bibbikatalog]", err);
      this.render({
        error: "Kan ikke vise resultater fra Bibbi katalog akkurat nå på grunn av en feil.",
      });
    }
  },
};

window.bibbiKatalogWidget = function (data) {
  // Only activate the widget on Bibbi concept pages with a prefLabel.
  if (
    window.SKOSMOS.vocab !== BIBBI_VOCAB_ID ||
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
