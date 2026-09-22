package com.app.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class DiagramModel {
    private Long id;
    private String name;
    private long version = 0L;
    private List<ClassModel> classes = new ArrayList<>();
    private List<RelationModel> relations = new ArrayList<>();
}
