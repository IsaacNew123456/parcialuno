package com.app.dto;

import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
@NoArgsConstructor
public class ClassModel {
    private String id;
    private String name;
    private Double x;
    private Double y;
    private long version = 0L;
    private List<AttrModel> attrs = new ArrayList<>();
    private Boolean isPivotTable = false;
    private List<String> primaryKeyColumns = new ArrayList<>();
    private List<String> methods = new ArrayList<>();
}
