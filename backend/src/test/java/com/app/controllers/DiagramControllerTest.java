package com.app.controllers;

import com.app.dto.AttrModel;
import com.app.dto.ClassModel;
import com.app.dto.DiagramModel;
import com.app.dto.RelationModel;
import com.app.services.DiagramService;
import com.app.services.NormalizationService;
import com.app.services.XmiService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class DiagramControllerTest {

    private MockMvc mockMvc;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private DiagramService diagramService;
    private XmiService xmiService;
    private NormalizationService normalizationService;

    @BeforeEach
    void setUp() {
        diagramService = Mockito.mock(DiagramService.class);
        xmiService = Mockito.mock(XmiService.class);
        normalizationService = new NormalizationService();
        DiagramController controller = new DiagramController(diagramService, xmiService, normalizationService);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    @DisplayName("POST /api/diagrams/normalize returns 200 OK with normalized LogicalSchemaModel and pivot table")
    void testNormalizeEndpointReturnsLogicalSchemaModel() throws Exception {
        DiagramModel model = new DiagramModel();
        model.setName("Universidad");

        ClassModel prof = new ClassModel();
        prof.setId("c_prof");
        prof.setName("Profesor");
        prof.getAttrs().add(new AttrModel("nombre", "varchar"));

        ClassModel mat = new ClassModel();
        mat.setId("c_mat");
        mat.setName("Materia");
        mat.getAttrs().add(new AttrModel("codigo", "varchar"));

        model.getClasses().add(prof);
        model.getClasses().add(mat);

        RelationModel relNm = new RelationModel();
        relNm.setFromId("c_prof");
        relNm.setFromName("Profesor");
        relNm.setToId("c_mat");
        relNm.setToName("Materia");
        relNm.setMult("*..*");
        model.getRelations().add(relNm);

        String requestJson = objectMapper.writeValueAsString(model);

        mockMvc.perform(post("/api/diagrams/normalize")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestJson))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.normalized", is(true)))
                .andExpect(jsonPath("$.pivotTablesCount", is(1)))
                .andExpect(jsonPath("$.classes", hasSize(3)))
                .andExpect(jsonPath("$.classes[2].isPivotTable", is(true)))
                .andExpect(jsonPath("$.classes[2].name", containsString("Profesor_Materia")))
                .andExpect(jsonPath("$.relations", hasSize(2)))
                .andExpect(jsonPath("$.normalizationNotes", hasSize(org.hamcrest.Matchers.greaterThan(0))));
    }
}
